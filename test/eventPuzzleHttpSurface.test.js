// Evento "O Coração da Máquina Celestial" — Fase 17 (QA/hardening
// final). Cobertura que nunca existiu em nenhuma fase anterior: a
// CAMADA HTTP em si — controllers (status code/envelope de resposta) e
// o wiring de permissão das rotas Admin. Todas as Fases 1-15 só
// testaram services diretamente (require("../src/services/...")) —
// bugs de wiring no controller (ex.: o controller chamar o service
// errado, devolver o status code errado, ou `req.params`/`req.body`
// não baterem com o que a rota realmente manda) nunca tinham teste
// automatizado nenhum; dois desses bugs (atualizarBlueprint/
// atualizarPista) só foram achados por teste manual durante a Fase 15.
//
// Mesmo padrão leve já usado em adminPanelFundacao.test.js/
// referralSistema.test.js/tournamentIntegracao.test.js: chama o
// controller/middleware de verdade com req/res mockados (nunca
// supertest/app.listen — app.js sobe scheduler/Discord/Socket.IO como
// efeito colateral só de ser importado, pesado demais pra um teste de
// unidade) contra o banco real — nunca um service mockado.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const User = require("../src/models/User");
const AdminRole = require("../src/models/AdminRole");
const AdminPermission = require("../src/models/AdminPermission");
const AdminRolePermission = require("../src/models/AdminRolePermission");
const UserAdminRole = require("../src/models/UserAdminRole");
const requireAdminPermission = require("../src/middlewares/requireAdminPermission");

const eventPuzzleController = require("../src/controllers/eventPuzzleController");
const adminEventPuzzleController = require("../src/controllers/adminEventPuzzleController");
const eventPuzzleRoutes = require("../src/routes/eventPuzzleRoutes");
const adminEventPuzzleRoutes = require("../src/routes/adminEventPuzzleRoutes");

let temBanco = false;
test.before(async () => {
  temBanco = await bancoDisponivel();
});

function testeComBanco(nome, fn) {
  test(nome, async (t) => {
    if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
    return fn(t);
  });
}

function slug() {
  return sufixo().replace(/_/g, "-");
}

// Mesma forma de reqRes() de test/adminPanelFundacao.test.js — só
// adiciona `params`, que os controllers deste domínio usam bastante
// (:id/:versionId/:idFase/:idResistencia).
function reqRes({ userId, personagemAtual, params, body, query } = {}) {
  let statusCode = null;
  let corpo = null;
  const req = {
    user: userId ? { id: userId } : undefined,
    personagemAtual,
    params: params ?? {},
    body: body ?? {},
    query: query ?? {},
    ip: "127.0.0.1",
    get: () => "teste-agent",
  };
  const res = {
    status(codigo) {
      statusCode = codigo;
      return this;
    },
    json(payload) {
      corpo = payload;
      return this;
    },
  };
  return { req, res, resultado: () => ({ statusCode, corpo }) };
}

function configSimples(objectiveId = "obj1") {
  return {
    dominio: "MECANICO",
    components: [
      { id: "motor1", type: "MOTOR", props: { rpmNominal: 60, sentido: "CW" }, position: { x: 0, y: 0 } },
      { id: "output1", type: "OUTPUT", props: { rpmAlvo: 60, sentidoAlvo: "CW", toleranciaRpm: 0 }, position: { x: 1, y: 0 } },
    ],
    connections: [{ id: "c1", from: { componentId: "motor1", port: "out" }, to: { componentId: "output1", port: "in" } }],
    objectives: [{ id: objectiveId, descricao: "Ligar o motor", condicao: { op: "EQUALS", path: "components.output1.atingido", value: true } }],
  };
}

async function criarUsuarioAdmin() {
  const chave = sufixo();
  return User.create({
    username: `admin_http_${chave}`,
    email: `admin_http_${chave}@teste.local`,
    passwordHash: "hash-de-teste",
    isAdmin: true,
  });
}

// Cria uma AdminRole NOVA, do zero, com só as permissões pedidas —
// nunca reaproveita "SuperAdmin"/"Eventos" (que concedem
// event_puzzle.view E .manage juntas, ver migration
// 20270210010000-event-puzzle-fase1-permissoes.js), porque o ponto
// deste teste é provar que quem só tem .view NÃO consegue .manage.
async function criarAdminComPermissoes(chaves) {
  const admin = await criarUsuarioAdmin();
  const role = await AdminRole.create({ nome: `RoleHttpTeste_${sufixo()}` });
  for (const chave of chaves) {
    const [permissao] = await AdminPermission.findOrCreate({
      where: { chave },
      defaults: { chave, descricao: chave },
    });
    await AdminRolePermission.create({ id_role: role.id, id_permission: permissao.id });
  }
  await UserAdminRole.create({ id_user: admin.id, id_role: role.id });
  return admin;
}

async function criarFundacao() {
  const eventDefinitionService = require("../src/services/eventDefinitionService");
  const eventEditionService = require("../src/services/eventEditionService");
  const puzzleBlueprintService = require("../src/services/puzzleBlueprintService");

  const chave = slug();
  const definicao = await eventDefinitionService.criar({ key: `http-evento-${chave}`, nome: `HTTP Evento ${chave}` });
  await eventDefinitionService.transicionar(definicao.id, "PUBLISHED");
  const edicao = await eventEditionService.criar(definicao.id, { key: `http-edicao-${chave}`, nome: `HTTP Edição ${chave}` });
  await eventEditionService.transicionar(edicao.id, "ACTIVE");

  const { blueprint, versao } = await puzzleBlueprintService.criarBlueprint(definicao.id, { key: `http-sala-${chave}`, nome: "HTTP Sala", ordem: 1 });
  await puzzleBlueprintService.atualizarDraft(versao.id, { config: configSimples("obj1") });
  const versaoFinal = await puzzleBlueprintService.transicionar(versao.id, "PUBLISHED", {});

  return { definicao, edicao, blueprint, versao: versaoFinal };
}

test.after(async () => {
  if (temBanco) await sequelize.close();
});

// --------------------------------------------- roteamento (smoke)

test("eventPuzzleRoutes/adminEventPuzzleRoutes exportam routers Express com rotas reais registradas", () => {
  assert.ok(Array.isArray(eventPuzzleRoutes.stack) && eventPuzzleRoutes.stack.length >= 8, "router do jogador deveria ter pelo menos as 8 rotas da Fase 1-12");
  assert.ok(Array.isArray(adminEventPuzzleRoutes.stack) && adminEventPuzzleRoutes.stack.length >= 30, "router admin deveria ter pelo menos as ~33 rotas de todas as fases");
});

// ----------------------------------- permissão real das rotas Admin

testeComBanco("requireAdminPermission: admin só com event_puzzle.view recebe 403 em rota gated por .manage; admin com .manage passa", async () => {
  const adminSoLeitura = await criarAdminComPermissoes(["event_puzzle.view"]);
  const adminComManage = await criarAdminComPermissoes(["event_puzzle.view", "event_puzzle.manage"]);
  const middleware = requireAdminPermission("event_puzzle.manage");

  const tentativaBloqueada = reqRes({ userId: adminSoLeitura.id });
  let proximoChamado = false;
  await middleware(tentativaBloqueada.req, tentativaBloqueada.res, () => { proximoChamado = true; });
  assert.equal(proximoChamado, false, "next() nunca deveria ser chamado sem a permissão certa");
  assert.equal(tentativaBloqueada.resultado().statusCode, 403);

  const tentativaLiberada = reqRes({ userId: adminComManage.id });
  proximoChamado = false;
  await middleware(tentativaLiberada.req, tentativaLiberada.res, () => { proximoChamado = true; });
  assert.equal(proximoChamado, true, "next() deveria ser chamado — admin tem event_puzzle.manage");
  assert.equal(tentativaLiberada.resultado().statusCode, null, "middleware nunca deveria ter chamado res.status() no caminho feliz");
});

// --------------------------------------------- controller — jogador

testeComBanco("eventPuzzleController: listarEdicoesAtivas/listarBlueprintsPublicos devolvem 200 com os dados reais recém-criados", async () => {
  const { edicao, blueprint } = await criarFundacao();
  const { personagem } = await criarPersonagem({});

  const rrEdicoes = reqRes({ personagemAtual: { id: personagem.id, nome: personagem.nome } });
  await eventPuzzleController.listarEdicoesAtivas(rrEdicoes.req, rrEdicoes.res);
  const { statusCode: sc1, corpo: c1 } = rrEdicoes.resultado();
  assert.equal(sc1, null, "res.json sem status() explícito é 200 por padrão no Express real");
  assert.equal(c1.status, "success");
  assert.ok(c1.data.some((e) => e.id === edicao.id), "a edição real recém-criada deveria aparecer na listagem pública");

  const rrBlueprints = reqRes({ personagemAtual: { id: personagem.id, nome: personagem.nome }, params: { editionId: String(edicao.id) } });
  await eventPuzzleController.listarBlueprintsPublicos(rrBlueprints.req, rrBlueprints.res);
  const { corpo: c2 } = rrBlueprints.resultado();
  assert.equal(c2.status, "success");
  const salaPublica = c2.data.find((b) => b.id_blueprint === blueprint.id);
  assert.ok(salaPublica, "a sala real deveria aparecer na listagem pública da edição");
  assert.equal(salaPublica.bloqueado, false, "primeira sala da edição nunca começa bloqueada");
  assert.ok(salaPublica.layout, "sala desbloqueada precisa vir com layout pra o cliente desenhar a cena");
});

testeComBanco("eventPuzzleController: criarOuObterInstancia é idempotente (201 na primeira vez, 200 devolvendo a MESMA instância na segunda)", async () => {
  const { edicao, blueprint } = await criarFundacao();
  const { personagem } = await criarPersonagem({});

  const rr1 = reqRes({ personagemAtual: { id: personagem.id, nome: personagem.nome }, params: { editionId: String(edicao.id) }, body: { idBlueprint: blueprint.id } });
  await eventPuzzleController.criarOuObterInstancia(rr1.req, rr1.res);
  const { statusCode: sc1, corpo: c1 } = rr1.resultado();
  assert.equal(sc1, 201);
  assert.equal(c1.status, "success");
  const idInstancia = c1.data.id;

  const rr2 = reqRes({ personagemAtual: { id: personagem.id, nome: personagem.nome }, params: { editionId: String(edicao.id) }, body: { idBlueprint: blueprint.id } });
  await eventPuzzleController.criarOuObterInstancia(rr2.req, rr2.res);
  const { statusCode: sc2, corpo: c2 } = rr2.resultado();
  assert.equal(sc2, 200, "segunda chamada idêntica devolve 200, nunca cria uma segunda instância");
  assert.equal(c2.data.id, idInstancia);
});

testeComBanco("eventPuzzleController: obterInstancia devolve 200 pro dono real e 404 pra outro personagem", async () => {
  const { edicao, blueprint } = await criarFundacao();
  const { personagem: dono } = await criarPersonagem({});
  const { personagem: intruso } = await criarPersonagem({});

  const rrCria = reqRes({ personagemAtual: { id: dono.id, nome: dono.nome }, params: { editionId: String(edicao.id) }, body: { idBlueprint: blueprint.id } });
  await eventPuzzleController.criarOuObterInstancia(rrCria.req, rrCria.res);
  const idInstancia = rrCria.resultado().corpo.data.id;

  const rrDono = reqRes({ personagemAtual: { id: dono.id, nome: dono.nome }, params: { id: String(idInstancia) } });
  await eventPuzzleController.obterInstancia(rrDono.req, rrDono.res);
  assert.equal(rrDono.resultado().statusCode, null);
  assert.equal(rrDono.resultado().corpo.data.id, idInstancia);

  const rrIntruso = reqRes({ personagemAtual: { id: intruso.id, nome: intruso.nome }, params: { id: String(idInstancia) } });
  await eventPuzzleController.obterInstancia(rrIntruso.req, rrIntruso.res);
  assert.equal(rrIntruso.resultado().statusCode, 404, "instância de outro personagem nunca pode vazar via GET direto por id");
});

testeComBanco("eventPuzzleController: executarAcao devolve 200 com instancia/eventos/pistasDesbloqueadas/conquistasPioneiras/recompensasConcedidas", async () => {
  const { edicao, blueprint } = await criarFundacao();
  const { personagem } = await criarPersonagem({});

  const rrCria = reqRes({ personagemAtual: { id: personagem.id, nome: personagem.nome }, params: { editionId: String(edicao.id) }, body: { idBlueprint: blueprint.id } });
  await eventPuzzleController.criarOuObterInstancia(rrCria.req, rrCria.res);
  const instanciaCriada = rrCria.resultado().corpo.data;

  const rrAcao = reqRes({
    personagemAtual: { id: personagem.id, nome: personagem.nome },
    params: { id: String(instanciaCriada.id) },
    body: { type: "LIGAR", componentId: "motor1", stateVersion: instanciaCriada.state_version },
  });
  await eventPuzzleController.executarAcao(rrAcao.req, rrAcao.res);
  const { statusCode, corpo } = rrAcao.resultado();
  assert.equal(statusCode, null);
  assert.equal(corpo.status, "success");
  assert.ok(corpo.data.instancia, "resposta da ação precisa incluir o dtoRuntime atualizado da instância");
  assert.equal(corpo.data.instancia.status, "COMPLETED", "LIGAR motor1 sozinho já resolve a golden solution de configSimples — a sala deveria fechar");
  assert.ok(Array.isArray(corpo.data.eventos));
  assert.ok(Array.isArray(corpo.data.pistasDesbloqueadas));
  assert.ok(Array.isArray(corpo.data.conquistasPioneiras));
  assert.ok(Array.isArray(corpo.data.recompensasConcedidas));
});

testeComBanco("eventPuzzleController: executarAcao com stateVersion velho devolve o 409 real (concorrência otimista), nunca 500", async () => {
  const { edicao, blueprint } = await criarFundacao();
  const { personagem } = await criarPersonagem({});

  const rrCria = reqRes({ personagemAtual: { id: personagem.id, nome: personagem.nome }, params: { editionId: String(edicao.id) }, body: { idBlueprint: blueprint.id } });
  await eventPuzzleController.criarOuObterInstancia(rrCria.req, rrCria.res);
  const instanciaCriada = rrCria.resultado().corpo.data;

  const rrAcao = reqRes({
    personagemAtual: { id: personagem.id, nome: personagem.nome },
    params: { id: String(instanciaCriada.id) },
    // +1 (nunca -1): expectedVersion precisa ser um inteiro >= 0 pra
    // sequer chegar no UPDATE condicional (aplicarMutacao rejeita
    // negativo com 400 ANTES de checar staleness) — qualquer valor
    // não-negativo que não bate com o real já reproduz CONFLITO_VERSAO.
    body: { type: "LIGAR", componentId: "motor1", stateVersion: instanciaCriada.state_version + 1 },
  });
  await eventPuzzleController.executarAcao(rrAcao.req, rrAcao.res);
  const { statusCode, corpo } = rrAcao.resultado();
  assert.equal(statusCode, 409);
  assert.ok(corpo.message);
});

testeComBanco("eventPuzzleController: abandonarInstancia devolve 200 com status ABANDONED", async () => {
  const { edicao, blueprint } = await criarFundacao();
  const { personagem } = await criarPersonagem({});

  const rrCria = reqRes({ personagemAtual: { id: personagem.id, nome: personagem.nome }, params: { editionId: String(edicao.id) }, body: { idBlueprint: blueprint.id } });
  await eventPuzzleController.criarOuObterInstancia(rrCria.req, rrCria.res);
  const instanciaCriada = rrCria.resultado().corpo.data;

  const rrAbandono = reqRes({
    personagemAtual: { id: personagem.id, nome: personagem.nome },
    params: { id: String(instanciaCriada.id) },
    body: { stateVersion: instanciaCriada.state_version },
  });
  await eventPuzzleController.abandonarInstancia(rrAbandono.req, rrAbandono.res);
  const { statusCode, corpo } = rrAbandono.resultado();
  assert.equal(statusCode, null);
  assert.equal(corpo.data.status, "ABANDONED");
});

testeComBanco("eventPuzzleController: obterStatusDoBoss/obterCaderno/obterHallDasLendas devolvem 200 mesmo sem nenhum conteúdo configurado ainda", async () => {
  const { edicao } = await criarFundacao();
  const { personagem } = await criarPersonagem({});
  const params = { editionId: String(edicao.id) };

  const rrBoss = reqRes({ personagemAtual: { id: personagem.id, nome: personagem.nome }, params });
  await eventPuzzleController.obterStatusDoBoss(rrBoss.req, rrBoss.res);
  assert.equal(rrBoss.resultado().corpo.data.status, "Nenhum", "sem EventPuzzleBossConfig ainda, status público precisa ser Nenhum — nunca 404/500");

  const rrCaderno = reqRes({ personagemAtual: { id: personagem.id, nome: personagem.nome }, params });
  await eventPuzzleController.obterCaderno(rrCaderno.req, rrCaderno.res);
  assert.deepEqual(rrCaderno.resultado().corpo.data, []);

  const rrLendas = reqRes({ personagemAtual: { id: personagem.id, nome: personagem.nome }, params });
  await eventPuzzleController.obterHallDasLendas(rrLendas.req, rrLendas.res);
  const lendas = rrLendas.resultado().corpo.data;
  assert.ok(Array.isArray(lendas.quadro));
  assert.ok(Array.isArray(lendas.feed));
});

// --------------------------------------------- controller — admin

testeComBanco("adminEventPuzzleController: ciclo completo de EventDefinition via controller (criar 201 -> transicionar 200)", async () => {
  const admin = await criarAdminComPermissoes(["event_puzzle.manage"]);
  const chave = slug();

  const rrCriar = reqRes({ userId: admin.id, body: { key: `admin-http-evento-${chave}`, nome: `Admin HTTP Evento ${chave}` } });
  await adminEventPuzzleController.criarDefinicao(rrCriar.req, rrCriar.res);
  const { statusCode: scCriar, corpo: cCriar } = rrCriar.resultado();
  assert.equal(scCriar, 201);
  assert.equal(cCriar.status, "success");
  assert.equal(cCriar.data.status, "DRAFT");

  const rrTransicionar = reqRes({ userId: admin.id, params: { id: String(cCriar.data.id) }, body: { status: "PUBLISHED" } });
  await adminEventPuzzleController.transicionarDefinicao(rrTransicionar.req, rrTransicionar.res);
  const { statusCode: scTrans, corpo: cTrans } = rrTransicionar.resultado();
  assert.equal(scTrans, null);
  assert.equal(cTrans.data.status, "PUBLISHED");
});

testeComBanco("adminEventPuzzleController: transicionarDefinicao com transição ilegal devolve o statusCode real do service (nunca 500 genérico)", async () => {
  const admin = await criarAdminComPermissoes(["event_puzzle.manage"]);
  const chave = slug();
  const rrCriar = reqRes({ userId: admin.id, body: { key: `admin-http-ilegal-${chave}`, nome: `Admin HTTP Ilegal ${chave}` } });
  await adminEventPuzzleController.criarDefinicao(rrCriar.req, rrCriar.res);
  const idDefinicao = rrCriar.resultado().corpo.data.id;

  // DRAFT -> ARCHIVED é legal, mas DRAFT -> ARCHIVED -> PUBLISHED não é
  // (ARCHIVED é terminal) — exercita o branch de erro de
  // transicaoValida() através do controller de verdade.
  const rrArquivar = reqRes({ userId: admin.id, params: { id: String(idDefinicao) }, body: { status: "ARCHIVED" } });
  await adminEventPuzzleController.transicionarDefinicao(rrArquivar.req, rrArquivar.res);
  assert.equal(rrArquivar.resultado().statusCode, null);

  const rrRepublicar = reqRes({ userId: admin.id, params: { id: String(idDefinicao) }, body: { status: "PUBLISHED" } });
  await adminEventPuzzleController.transicionarDefinicao(rrRepublicar.req, rrRepublicar.res);
  const { statusCode, corpo } = rrRepublicar.resultado();
  assert.ok(statusCode >= 400 && statusCode < 500, `transição ilegal precisa de um 4xx real do service, recebeu ${statusCode}`);
  assert.ok(corpo.message);
});

testeComBanco("adminEventPuzzleController: atualizarBlueprint devolve 404 real pra id inexistente (bug já corrigido manualmente na Fase 15 — nunca mais sem teste)", async () => {
  const admin = await criarAdminComPermissoes(["event_puzzle.manage"]);
  const rr = reqRes({ userId: admin.id, params: { id: "999999999" }, body: { nome: "Não existe" } });
  await adminEventPuzzleController.atualizarBlueprint(rr.req, rr.res);
  const { statusCode, corpo } = rr.resultado();
  assert.equal(statusCode, 404);
  assert.match(corpo.message, /não encontrado/i);
});

testeComBanco("adminEventPuzzleController: fluxo Blueprint/Version/solvabilidade completo via controller", async () => {
  const admin = await criarAdminComPermissoes(["event_puzzle.manage"]);
  const chave = slug();

  const rrDef = reqRes({ userId: admin.id, body: { key: `admin-http-fluxo-${chave}`, nome: `Admin HTTP Fluxo ${chave}` } });
  await adminEventPuzzleController.criarDefinicao(rrDef.req, rrDef.res);
  const idDefinicao = rrDef.resultado().corpo.data.id;

  // publicar o EventDefinition primeiro — transicionarVersao pra
  // PUBLISHED exige que o evento-pai já esteja PUBLISHED (ver
  // EVENTO_NAO_PUBLICADO em puzzleBlueprintService.transicionar).
  const rrPublicarDef = reqRes({ userId: admin.id, params: { id: String(idDefinicao) }, body: { status: "PUBLISHED" } });
  await adminEventPuzzleController.transicionarDefinicao(rrPublicarDef.req, rrPublicarDef.res);
  assert.equal(rrPublicarDef.resultado().corpo.data.status, "PUBLISHED");

  const rrBp = reqRes({ userId: admin.id, params: { id: String(idDefinicao) }, body: { key: `admin-http-sala-${chave}`, nome: "Sala HTTP", ordem: 1 } });
  await adminEventPuzzleController.criarBlueprint(rrBp.req, rrBp.res);
  const { statusCode: scBp, corpo: cBp } = rrBp.resultado();
  assert.equal(scBp, 201);
  const idBlueprint = cBp.data.blueprint.id;
  const idVersao = cBp.data.versao.id;

  const rrAtualizarBp = reqRes({ userId: admin.id, params: { id: String(idBlueprint) }, body: { nome: "Sala HTTP Renomeada" } });
  await adminEventPuzzleController.atualizarBlueprint(rrAtualizarBp.req, rrAtualizarBp.res);
  assert.equal(rrAtualizarBp.resultado().corpo.data.nome, "Sala HTTP Renomeada");

  const rrConfig = reqRes({ userId: admin.id, params: { versionId: String(idVersao) }, body: { config: configSimples("obj1") } });
  await adminEventPuzzleController.atualizarVersao(rrConfig.req, rrConfig.res);
  assert.equal(rrConfig.resultado().statusCode, null);

  const rrSolv = reqRes({ userId: admin.id, params: { versionId: String(idVersao) }, body: { acoes: [{ type: "LIGAR", componentId: "motor1" }] } });
  await adminEventPuzzleController.validarSolvabilidade(rrSolv.req, rrSolv.res);
  const { corpo: cSolv } = rrSolv.resultado();
  assert.equal(cSolv.status, "success");
  assert.equal(cSolv.data.valido, true);
  assert.ok(cSolv.data.assinatura);

  const rrPublicar = reqRes({ userId: admin.id, params: { versionId: String(idVersao) }, body: { status: "PUBLISHED" } });
  await adminEventPuzzleController.transicionarVersao(rrPublicar.req, rrPublicar.res);
  assert.equal(rrPublicar.resultado().corpo.data.status, "PUBLISHED");
});

testeComBanco("adminEventPuzzleController: CRUD de pista/marco/recompensa via controller (criar 201 -> editar 200 -> excluir 200)", async () => {
  const admin = await criarAdminComPermissoes(["event_puzzle.manage"]);
  const { blueprint } = await criarFundacao();
  const idAdmin = admin.id;
  const idBlueprint = String(blueprint.id);

  const rrPista = reqRes({ userId: idAdmin, params: { id: idBlueprint }, body: { key: "pista-http", titulo: "Pista HTTP", texto: "Texto", triggerType: "INSTANCE_COMPLETED", ordem: 0 } });
  await adminEventPuzzleController.criarPista(rrPista.req, rrPista.res);
  const { statusCode: scPista, corpo: cPista } = rrPista.resultado();
  assert.equal(scPista, 201);
  const idPista = cPista.data.id;

  const rrEditarPista = reqRes({ userId: idAdmin, params: { id: String(idPista) }, body: { titulo: "Pista HTTP Editada" } });
  await adminEventPuzzleController.atualizarPista(rrEditarPista.req, rrEditarPista.res);
  assert.equal(rrEditarPista.resultado().corpo.data.titulo, "Pista HTTP Editada");

  const rrExcluirPista = reqRes({ userId: idAdmin, params: { id: String(idPista) } });
  await adminEventPuzzleController.excluirPista(rrExcluirPista.req, rrExcluirPista.res);
  assert.equal(rrExcluirPista.resultado().corpo.data.excluida, true);

  const rrMarco = reqRes({ userId: idAdmin, params: { id: idBlueprint }, body: { key: "marco-http", titulo: "Marco HTTP", descricao: "Descrição", triggerType: "INSTANCE_COMPLETED" } });
  await adminEventPuzzleController.criarMarco(rrMarco.req, rrMarco.res);
  const { statusCode: scMarco, corpo: cMarco } = rrMarco.resultado();
  assert.equal(scMarco, 201);
  const idMarco = cMarco.data.id;

  const rrEditarMarco = reqRes({ userId: idAdmin, params: { id: String(idMarco) }, body: { titulo: "Marco HTTP Editado" } });
  await adminEventPuzzleController.atualizarMarco(rrEditarMarco.req, rrEditarMarco.res);
  assert.equal(rrEditarMarco.resultado().corpo.data.titulo, "Marco HTTP Editado");

  const rrExcluirMarco = reqRes({ userId: idAdmin, params: { id: String(idMarco) } });
  await adminEventPuzzleController.excluirMarco(rrExcluirMarco.req, rrExcluirMarco.res);
  assert.equal(rrExcluirMarco.resultado().corpo.data.excluida, true);

  const rrRecompensa = reqRes({
    userId: idAdmin,
    params: { id: idBlueprint },
    body: { key: "recompensa-http", tituloExibicao: "Recompensa HTTP", descricaoExibicao: "Descrição", triggerType: "INSTANCE_COMPLETED", rewardOuro: 10 },
  });
  await adminEventPuzzleController.criarRecompensa(rrRecompensa.req, rrRecompensa.res);
  const { statusCode: scRecompensa, corpo: cRecompensa } = rrRecompensa.resultado();
  assert.equal(scRecompensa, 201);
  const idRecompensa = cRecompensa.data.id;

  const rrEditarRecompensa = reqRes({ userId: idAdmin, params: { id: String(idRecompensa) }, body: { rewardOuro: 20 } });
  await adminEventPuzzleController.atualizarRecompensa(rrEditarRecompensa.req, rrEditarRecompensa.res);
  assert.equal(rrEditarRecompensa.resultado().corpo.data.reward_ouro, 20);

  const rrExcluirRecompensa = reqRes({ userId: idAdmin, params: { id: String(idRecompensa) } });
  await adminEventPuzzleController.excluirRecompensa(rrExcluirRecompensa.req, rrExcluirRecompensa.res);
  assert.equal(rrExcluirRecompensa.resultado().corpo.data.excluida, true);
});

testeComBanco("adminEventPuzzleController: CRUD completo do Custódio do Meridiano via controller", async () => {
  const admin = await criarAdminComPermissoes(["event_puzzle.manage"]);
  const { definicao, blueprint } = await criarFundacao();
  const AdventureMonster = require("../src/models/AdventureMonster");
  const monstro = await AdventureMonster.create({
    nome: `Custódio HTTP Teste ${sufixo()}`,
    nivel: 50,
    vida_maxima: 1000,
    dano_min: 40,
    dano_max: 60,
    defesa: 10,
    ai_profile: "BOSS",
    disponivel_emboscada: false,
  });

  const rrSemConfig = reqRes({ userId: admin.id, params: { id: String(definicao.id) } });
  await adminEventPuzzleController.obterBoss(rrSemConfig.req, rrSemConfig.res);
  assert.equal(rrSemConfig.resultado().corpo.data.config, null);

  const rrSalvar = reqRes({
    userId: admin.id,
    params: { id: String(definicao.id) },
    body: { id_monstro_base: monstro.id, id_blueprint_gatilho: blueprint.id, nome_exibicao: "Custódio HTTP" },
  });
  await adminEventPuzzleController.salvarBossConfig(rrSalvar.req, rrSalvar.res);
  const { corpo: cSalvar } = rrSalvar.resultado();
  assert.equal(cSalvar.status, "success");
  assert.equal(cSalvar.data.id_monstro_base, monstro.id);

  const rrFase = reqRes({ userId: admin.id, params: { id: String(definicao.id) }, body: { hp_threshold_pct: 50, nome_exibicao: "Fase HTTP" } });
  await adminEventPuzzleController.criarBossFase(rrFase.req, rrFase.res);
  const { statusCode: scFase, corpo: cFase } = rrFase.resultado();
  assert.equal(scFase, 201);
  const idFase = cFase.data.id;

  const rrEditarFase = reqRes({ userId: admin.id, params: { id: String(definicao.id), idFase: String(idFase) }, body: { dano_multiplicador: 1.5 } });
  await adminEventPuzzleController.atualizarBossFase(rrEditarFase.req, rrEditarFase.res);
  assert.equal(rrEditarFase.resultado().corpo.data.dano_multiplicador, 1.5);

  const rrExcluirFase = reqRes({ userId: admin.id, params: { id: String(definicao.id), idFase: String(idFase) } });
  await adminEventPuzzleController.excluirBossFase(rrExcluirFase.req, rrExcluirFase.res);
  assert.equal(rrExcluirFase.resultado().statusCode, null);

  const rrResist = reqRes({ userId: admin.id, params: { id: String(definicao.id) }, body: { status_key: "STUN", imune: true } });
  await adminEventPuzzleController.criarBossResistencia(rrResist.req, rrResist.res);
  const { statusCode: scResist, corpo: cResist } = rrResist.resultado();
  assert.equal(scResist, 201);
  const idResistencia = cResist.data.id;

  const rrEditarResist = reqRes({ userId: admin.id, params: { id: String(definicao.id), idResistencia: String(idResistencia) }, body: { resistencia_pct: 50 } });
  await adminEventPuzzleController.atualizarBossResistencia(rrEditarResist.req, rrEditarResist.res);
  assert.equal(rrEditarResist.resultado().corpo.data.resistencia_pct, 50);

  const rrExcluirResist = reqRes({ userId: admin.id, params: { id: String(definicao.id), idResistencia: String(idResistencia) } });
  await adminEventPuzzleController.excluirBossResistencia(rrExcluirResist.req, rrExcluirResist.res);
  assert.equal(rrExcluirResist.resultado().statusCode, null);
});
