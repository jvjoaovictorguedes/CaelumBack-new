// Evento "O Coração da Máquina Celestial" — Fase 1 (Fundação
// Persistente, Schemas e Ciclo de Vida). Cobre a matriz mínima pedida:
// constraints, lifecycle válido/inválido, imutabilidade de Blueprint
// publicado + nova revisão, congelamento de Instance na versão certa,
// isolamento entre instâncias, ownership, segurança Admin, DTO público
// sem segredo, state_version inicial, conflito de versão, e a prova de
// atomicidade real no Postgres pra 2 mutações concorrentes com o MESMO
// expectedVersion (não só chamar assertVersion 2x em memória).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const User = require("../src/models/User");
const AdminRole = require("../src/models/AdminRole");
const {
  EventDefinition,
  EventEdition,
  PuzzleBlueprint,
  PuzzleBlueprintVersion,
  PuzzleInstance,
  PuzzleParticipant,
} = require("../src/models/eventPuzzleModels");

const adminRoleService = require("../src/services/adminRoleService");
const requireAdminPermission = require("../src/middlewares/requireAdminPermission");
const eventDefinitionService = require("../src/services/eventDefinitionService");
const eventEditionService = require("../src/services/eventEditionService");
const puzzleBlueprintService = require("../src/services/puzzleBlueprintService");
const puzzleInstanceService = require("../src/services/puzzleInstanceService");

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

async function criarUsuarioAdmin() {
  const chave = sufixo();
  return User.create({
    username: `admin_evento_${chave}`,
    email: `admin_evento_${chave}@teste.local`,
    passwordHash: "hash-de-teste",
    isAdmin: true,
  });
}

function reqRes({ userId } = {}) {
  let statusCode = null;
  let corpo = null;
  const req = { user: userId ? { id: userId } : undefined, body: {}, query: {}, ip: "127.0.0.1", get: () => "teste-agent" };
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
  return { req, res, statusCode: () => statusCode, corpo: () => corpo };
}

// sufixo() devolve algo como "12345_1700000000000_3" — underscores não
// batem com a regex de key (só [a-z0-9-]); normaliza pra slug válido.
function slug() {
  return sufixo().replace(/_/g, "-");
}

// Fundação completa: definição PUBLISHED, edição ACTIVE, blueprint com
// 1 revisão PUBLISHED. Pronta pra criar PuzzleInstance.
async function criarFundacaoCompleta(transaction) {
  const chave = slug();
  const definicao = await eventDefinitionService.criar(
    { key: `evento-${chave}`, nome: `Evento ${chave}` },
    transaction,
  );
  await eventDefinitionService.transicionar(definicao.id, "PUBLISHED", transaction);

  const edicao = await eventEditionService.criar(
    definicao.id,
    { key: `edicao-${chave}`, nome: `Edição ${chave}` },
    transaction,
  );
  await eventEditionService.transicionar(edicao.id, "ACTIVE", transaction);

  const { blueprint, versao } = await puzzleBlueprintService.criarBlueprint(
    definicao.id,
    { key: `puzzle-${chave}`, nome: `Puzzle ${chave}` },
    transaction,
  );
  await puzzleBlueprintService.atualizarDraft(versao.id, { config: { titulo_publico: "Puzzle de teste" } }, transaction);
  const versaoPublicada = await puzzleBlueprintService.transicionar(versao.id, "PUBLISHED", {}, transaction);

  return { definicao, edicao, blueprint, versao: versaoPublicada };
}

// ---------------------------------------------------------------------
// 1. Constraints (UNIQUE/CHECK/FK)
// ---------------------------------------------------------------------

testeComBanco("UNIQUE(id_event_definition, key) em EventEdition rejeita key duplicada", async () => {
  const { definicao } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
  await eventEditionService.criar(definicao.id, { key: "duplicada", nome: "Edição A" });
  await assert.rejects(
    () => eventEditionService.criar(definicao.id, { key: "duplicada", nome: "Edição B" }),
    (e) => e.statusCode === 409,
  );
});

testeComBanco("UNIQUE(id_blueprint, version) e CHECK version>0 em PuzzleBlueprintVersion", async () => {
  const { blueprint } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
  await assert.rejects(
    () => PuzzleBlueprintVersion.create({ id_blueprint: blueprint.id, version: 1, config: {} }),
    (e) => e.name === "SequelizeUniqueConstraintError",
  );
  await assert.rejects(
    () => PuzzleBlueprintVersion.create({ id_blueprint: blueprint.id, version: 0, config: {} }),
    (e) => e.name === "SequelizeDatabaseError",
  );
});

testeComBanco("CHECK state_version>=0 em PuzzleInstance", async () => {
  const { edicao, versao } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
  await assert.rejects(
    () =>
      PuzzleInstance.create({
        id_event_edition: edicao.id,
        id_blueprint_version: versao.id,
        seed: "x",
        state_version: -1,
      }),
    (e) => e.name === "SequelizeDatabaseError",
  );
});

testeComBanco("UNIQUE(id_instance, id_personagem) em PuzzleParticipant — nunca o mesmo personagem 2x", async () => {
  const { edicao } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const instancia = await PuzzleInstance.create({
    id_event_edition: edicao.id,
    id_blueprint_version: (await PuzzleBlueprintVersion.findOne({ where: { id_blueprint: (await PuzzleBlueprint.findOne({ where: { id_event_definition: edicao.id_event_definition } })).id } })).id,
    seed: puzzleInstanceService.gerarSeed(),
  });
  await PuzzleParticipant.create({
    id_instance: instancia.id,
    id_personagem: personagem.id,
    personagem_nome_snapshot: personagem.nome,
  });
  await assert.rejects(
    () =>
      PuzzleParticipant.create({
        id_instance: instancia.id,
        id_personagem: personagem.id,
        personagem_nome_snapshot: personagem.nome,
      }),
    (e) => e.name === "SequelizeUniqueConstraintError",
  );
});

testeComBanco("índice parcial '1 ACTIVE por definição' em EventEdition devolve 409 limpo", async () => {
  const { definicao, edicao } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
  const outraEdicao = await eventEditionService.criar(definicao.id, { key: `outra-${slug()}`, nome: "Outra" });
  await assert.rejects(
    () => eventEditionService.transicionar(outraEdicao.id, "ACTIVE"),
    (e) => e.statusCode === 409,
  );
  // a primeira continua ACTIVE, intocada
  const recarregada = await EventEdition.findByPk(edicao.id);
  assert.equal(recarregada.status, "ACTIVE");
});

// ---------------------------------------------------------------------
// 2. Lifecycle válido/inválido (4 domínios, cada um com enum próprio)
// ---------------------------------------------------------------------

testeComBanco("EventDefinition: DRAFT→PUBLISHED→ARCHIVED válido; PUBLISHED→DRAFT inválido", async () => {
  const definicao = await eventDefinitionService.criar({ key: `def-${slug()}`, nome: "Teste" });
  await eventDefinitionService.transicionar(definicao.id, "PUBLISHED");
  await assert.rejects(
    () => eventDefinitionService.transicionar(definicao.id, "DRAFT"),
    (e) => e.statusCode === 409 && e.code === "LIFECYCLE_INVALIDO",
  );
  await eventDefinitionService.transicionar(definicao.id, "ARCHIVED");
  await assert.rejects(
    () => eventDefinitionService.transicionar(definicao.id, "PUBLISHED"),
    (e) => e.statusCode === 409 && e.code === "LIFECYCLE_INVALIDO",
  );
});

testeComBanco("EventEdition: CANCELLED alcançável de DRAFT/SCHEDULED/ACTIVE; nunca de ENDED", async () => {
  const definicao = await eventDefinitionService.criar({ key: `def-${slug()}`, nome: "Teste" });
  await eventDefinitionService.transicionar(definicao.id, "PUBLISHED");
  const edicao = await eventEditionService.criar(definicao.id, { key: `ed-${slug()}`, nome: "Teste" });
  await eventEditionService.transicionar(edicao.id, "ACTIVE");
  await eventEditionService.transicionar(edicao.id, "ENDED");
  await assert.rejects(
    () => eventEditionService.transicionar(edicao.id, "CANCELLED"),
    (e) => e.statusCode === 409 && e.code === "LIFECYCLE_INVALIDO",
  );
});

testeComBanco("PuzzleBlueprintVersion: DRAFT→ARCHIVED direto é válido (abandonar sem publicar)", async () => {
  const definicao = await eventDefinitionService.criar({ key: `def-${slug()}`, nome: "Teste" });
  const { versao } = await puzzleBlueprintService.criarBlueprint(definicao.id, { key: `bp-${slug()}`, nome: "Teste" });
  const arquivada = await puzzleBlueprintService.transicionar(versao.id, "ARCHIVED");
  assert.equal(arquivada.status, "ARCHIVED");
  await assert.rejects(
    () => puzzleBlueprintService.transicionar(versao.id, "PUBLISHED"),
    (e) => e.statusCode === 409 && e.code === "LIFECYCLE_INVALIDO",
  );
});

testeComBanco("PuzzleInstance: CREATED→ACTIVE→COMPLETED válido; COMPLETED→ACTIVE inválido (terminal)", async () => {
  const { edicao, versao } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { instancia } = await puzzleInstanceService.criarOuObterInstancia(
    edicao.id,
    (await PuzzleBlueprint.findOne({ where: { id_event_definition: edicao.id_event_definition } })).id,
    { id: personagem.id, nome: personagem.nome },
  );
  assert.equal(instancia.status, "CREATED");
  assert.equal(instancia.state_version, 0);

  const ativa = await puzzleInstanceService.aplicarMutacao(instancia.id, 0, { novoStatus: "ACTIVE" });
  assert.equal(ativa.status, "ACTIVE");
  assert.equal(ativa.state_version, 1);
  assert.ok(ativa.started_at);

  const completa = await puzzleInstanceService.aplicarMutacao(instancia.id, 1, { novoStatus: "COMPLETED" });
  assert.equal(completa.status, "COMPLETED");
  assert.ok(completa.completed_at);

  await assert.rejects(
    () => puzzleInstanceService.aplicarMutacao(instancia.id, 2, { novoStatus: "ACTIVE" }),
    (e) => e.statusCode === 409 && e.code === "LIFECYCLE_INVALIDO",
  );
});

// ---------------------------------------------------------------------
// 3. Blueprint publicado é IMUTÁVEL + criação de nova revisão
// ---------------------------------------------------------------------

testeComBanco("editar config de uma revisão PUBLISHED é rejeitado (imutabilidade)", async () => {
  const { versao } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
  await assert.rejects(
    () => puzzleBlueprintService.atualizarDraft(versao.id, { config: { outraCoisa: true } }),
    (e) => e.statusCode === 409 && e.code === "DRAFT_IMUTAVEL",
  );
  // a config original continua intocada
  const recarregada = await PuzzleBlueprintVersion.findByPk(versao.id);
  assert.deepEqual(recarregada.config, { titulo_publico: "Puzzle de teste" });
});

testeComBanco("nova revisão nasce DRAFT com version = anterior + 1, nunca reaproveita número", async () => {
  const { blueprint, versao } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
  assert.equal(versao.version, 1);
  const v2 = await puzzleBlueprintService.criarNovaVersao(blueprint.id, { config: { titulo_publico: "V2" } });
  assert.equal(v2.version, 2);
  assert.equal(v2.status, "DRAFT");
});

// ---------------------------------------------------------------------
// 4. Instance congelada na versão publicada correta na hora da criação
// ---------------------------------------------------------------------

testeComBanco("PuzzleInstance fica congelada na version usada na criação, mesmo após publicar uma nova", async () => {
  const { edicao, blueprint, versao: v1 } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  assert.equal(instancia.id_blueprint_version, v1.id);

  // publica uma v2 DEPOIS da instância já existir
  const v2 = await puzzleBlueprintService.criarNovaVersao(blueprint.id, { config: { titulo_publico: "V2" } });
  await puzzleBlueprintService.transicionar(v2.id, "PUBLISHED");

  const recarregada = await PuzzleInstance.findByPk(instancia.id);
  assert.equal(recarregada.id_blueprint_version, v1.id, "instância nunca migra pra versão mais nova sozinha");
});

// ---------------------------------------------------------------------
// 5. Isolamento entre instâncias — evoluem independentemente
// ---------------------------------------------------------------------

testeComBanco("2 PuzzleInstances evoluem independentemente — mutar uma não afeta a outra", async () => {
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
  const { personagem: p1 } = await criarPersonagem({ nivel: 5 });
  const { personagem: p2 } = await criarPersonagem({ nivel: 5 });

  const { instancia: i1 } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: p1.id,
    nome: p1.nome,
  });
  const { instancia: i2 } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: p2.id,
    nome: p2.nome,
  });
  assert.notEqual(i1.id, i2.id);

  await puzzleInstanceService.aplicarMutacao(i1.id, 0, { novoStatus: "ACTIVE" });
  await puzzleInstanceService.aplicarMutacao(i1.id, 1, { novoState: { public: { passo: 1 } } });

  const i2Recarregada = await PuzzleInstance.findByPk(i2.id);
  assert.equal(i2Recarregada.status, "CREATED", "instância 2 nunca é afetada pela mutação da instância 1");
  assert.equal(i2Recarregada.state_version, 0);
  assert.deepEqual(i2Recarregada.state, {});
});

// ---------------------------------------------------------------------
// 6. Ownership — nunca ler instância alheia
// ---------------------------------------------------------------------

testeComBanco("personagem não pode obter PuzzleInstance de outro personagem", async () => {
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
  const { personagem: dono } = await criarPersonagem({ nivel: 5 });
  const { personagem: intruso } = await criarPersonagem({ nivel: 5 });

  const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: dono.id,
    nome: dono.nome,
  });

  const propria = await puzzleInstanceService.obterParaPersonagem(instancia.id, dono.id);
  assert.equal(propria.id, instancia.id);

  await assert.rejects(
    () => puzzleInstanceService.obterParaPersonagem(instancia.id, intruso.id),
    (e) => e.statusCode === 404,
  );
});

// ---------------------------------------------------------------------
// 7. Segurança Admin — reaproveita AdminPermission/AdminRole de verdade
// ---------------------------------------------------------------------

testeComBanco("event_puzzle.manage: role 'Eventos' tem, role sem a permissão não tem", async () => {
  const admin = await criarUsuarioAdmin();
  const roleEventos = await AdminRole.findOne({ where: { nome: "Eventos" } });
  assert.ok(roleEventos, "a migration de permissões precisa ter concedido a role Eventos existente");
  await adminRoleService.assignRole(admin.id, roleEventos.id, { idAdmin: admin.id });

  const podeGerenciar = requireAdminPermission("event_puzzle.manage");
  const chamada = reqRes({ userId: admin.id });
  let liberou = false;
  await podeGerenciar(chamada.req, chamada.res, () => {
    liberou = true;
  });
  assert.equal(liberou, true, "role Eventos tem event_puzzle.manage (concedida pela migration)");

  const semPermissao = await criarUsuarioAdmin();
  const podeGerenciar2 = requireAdminPermission("event_puzzle.manage");
  const chamada2 = reqRes({ userId: semPermissao.id });
  let liberou2 = false;
  await podeGerenciar2(chamada2.req, chamada2.res, () => {
    liberou2 = true;
  });
  assert.equal(liberou2, false, "admin sem role nenhuma nunca tem event_puzzle.manage");
  assert.equal(chamada2.statusCode(), 403);
});

// ---------------------------------------------------------------------
// 8. DTO público/runtime NUNCA vaza segredo
// ---------------------------------------------------------------------

testeComBanco("dtoPublicoVersao nunca devolve chaves fora da allowlist, mesmo com segredo em config", async () => {
  const definicao = await eventDefinitionService.criar({ key: `def-${slug()}`, nome: "Teste" });
  const { blueprint, versao } = await puzzleBlueprintService.criarBlueprint(definicao.id, {
    key: `bp-${slug()}`,
    nome: "Teste",
  });
  await puzzleBlueprintService.atualizarDraft(versao.id, {
    config: {
      titulo_publico: "Título OK",
      golden_solution: "SENHA-SECRETA-123",
      regras_privadas: { peso_critico: 42 },
    },
  });
  const recarregada = await puzzleBlueprintService.obterVersaoPorId(versao.id);
  const dto = puzzleBlueprintService.dtoPublicoVersao(recarregada, blueprint);
  const serializado = JSON.stringify(dto);
  assert.ok(!serializado.includes("SENHA-SECRETA-123"), "golden_solution nunca aparece no DTO público");
  assert.ok(!serializado.includes("peso_critico"), "regras privadas nunca aparecem no DTO público");
  assert.equal(dto.titulo_publico, "Título OK");
});

testeComBanco("dtoRuntime só devolve state.public — qualquer outra chave de state é só-servidor", async () => {
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  await puzzleInstanceService.aplicarMutacao(instancia.id, 0, {
    novoState: {
      public: { progresso: 3 },
      golden_solution: "NUNCA-SAI-DAQUI",
      servidor_apenas: { risco: 99 },
    },
  });
  const recarregada = await PuzzleInstance.findByPk(instancia.id);
  const dto = puzzleInstanceService.dtoRuntime(recarregada);
  const serializado = JSON.stringify(dto);
  assert.ok(!serializado.includes("NUNCA-SAI-DAQUI"));
  assert.ok(!serializado.includes("servidor_apenas"));
  assert.deepEqual(dto.state, { progresso: 3 });
});

// ---------------------------------------------------------------------
// 9. state_version inicial + conflito de versão (chamada única stale)
// ---------------------------------------------------------------------

testeComBanco("state_version inicial é 0, seed é gerado no servidor e não vazio", async () => {
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { instancia, criada } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  assert.equal(criada, true);
  assert.equal(instancia.state_version, 0);
  assert.equal(typeof instancia.seed, "string");
  assert.ok(instancia.seed.length >= 32);
});

testeComBanco("aplicarMutacao com expectedVersion desatualizado rejeita com CONFLITO_VERSAO (409)", async () => {
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  await puzzleInstanceService.aplicarMutacao(instancia.id, 0, { novoStatus: "ACTIVE" }); // agora version=1
  await assert.rejects(
    () => puzzleInstanceService.aplicarMutacao(instancia.id, 0, { novoState: { public: { x: 1 } } }),
    (e) => e.statusCode === 409 && e.code === "CONFLITO_VERSAO",
  );
  const recarregada = await PuzzleInstance.findByPk(instancia.id);
  assert.equal(recarregada.state_version, 1, "a tentativa stale não incrementou nada");
});

// ---------------------------------------------------------------------
// 10. PROVA DE ATOMICIDADE REAL NO POSTGRES — 2 mutações concorrentes
//     com o MESMO expectedVersion nunca vencem as duas. Isto dispara 2
//     chamadas de verdade pro Postgres via Promise.all (2 round-trips
//     reais na pool de conexões, não 2 chamadas de assertVersion em
//     memória) — a garantia testada é o UPDATE condicional do banco.
// ---------------------------------------------------------------------

testeComBanco(
  "2 mutações concorrentes com o MESMO expectedVersion: só 1 vence, a outra recebe CONFLITO_VERSAO, state_version final é +1 (nunca +2)",
  async () => {
    const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
    const { personagem } = await criarPersonagem({ nivel: 5 });
    const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
      id: personagem.id,
      nome: personagem.nome,
    });
    assert.equal(instancia.state_version, 0);

    const resultados = await Promise.allSettled([
      puzzleInstanceService.aplicarMutacao(instancia.id, 0, { novoState: { public: { tentativa: "A" } } }),
      puzzleInstanceService.aplicarMutacao(instancia.id, 0, { novoState: { public: { tentativa: "B" } } }),
    ]);

    const sucessos = resultados.filter((r) => r.status === "fulfilled");
    const falhas = resultados.filter((r) => r.status === "rejected");
    assert.equal(sucessos.length, 1, "exatamente 1 das 2 mutações concorrentes vence");
    assert.equal(falhas.length, 1, "exatamente 1 recebe conflito");
    assert.equal(falhas[0].reason.code, "CONFLITO_VERSAO");

    const final = await PuzzleInstance.findByPk(instancia.id);
    assert.equal(final.state_version, 1, "state_version avança exatamente +1, nunca +2 — prova de atomicidade real");
    assert.ok(
      final.state.public.tentativa === "A" || final.state.public.tentativa === "B",
      "o state final é de QUEM venceu, nunca uma mistura dos dois",
    );
  },
);

// ---------------------------------------------------------------------
// 11. Idempotência de criação (seção 13) + rollback de operação composta
// ---------------------------------------------------------------------

testeComBanco("criarOuObterInstancia é idempotente — 2ª chamada devolve a MESMA instância, não cria outra", async () => {
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { instancia: i1, criada: criada1 } = await puzzleInstanceService.criarOuObterInstancia(
    edicao.id,
    blueprint.id,
    { id: personagem.id, nome: personagem.nome },
  );
  const { instancia: i2, criada: criada2 } = await puzzleInstanceService.criarOuObterInstancia(
    edicao.id,
    blueprint.id,
    { id: personagem.id, nome: personagem.nome },
  );
  assert.equal(criada1, true);
  assert.equal(criada2, false);
  assert.equal(i1.id, i2.id);

  const total = await PuzzleInstance.count({ where: { id_event_edition: edicao.id } });
  assert.equal(total, 1, "nunca cria uma segunda instância pro mesmo personagem+blueprint+edição");
});

testeComBanco(
  "rollback composto: se a criação do Participant falhar, a PuzzleInstance some junto (nunca órfã)",
  async () => {
    const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
    const { personagem } = await criarPersonagem({ nivel: 5 });

    const versaoPublicada = await puzzleBlueprintService.obterUltimaPublicada(blueprint.id);

    await assert.rejects(
      () =>
        sequelize.transaction(async (t) => {
          const instancia = await PuzzleInstance.create(
            { id_event_edition: edicao.id, id_blueprint_version: versaoPublicada.id, seed: puzzleInstanceService.gerarSeed() },
            { transaction: t },
          );
          // Força a falha do Participant DE PROPÓSITO (id_instance
          // inválido) — a transaction inteira precisa desfazer a
          // instância criada acima também.
          await PuzzleParticipant.create(
            {
              id_instance: instancia.id,
              id_personagem: personagem.id,
              personagem_nome_snapshot: personagem.nome,
              role: "ROLE_INVALIDO_DE_PROPOSITO",
            },
            { transaction: t },
          );
        }),
      (e) => e.name === "SequelizeDatabaseError",
    );

    const total = await PuzzleInstance.count({ where: { id_event_edition: edicao.id } });
    assert.equal(total, 0, "nenhuma PuzzleInstance órfã sobrevive ao rollback da transaction composta");
  },
);

// ---------------------------------------------------------------------
// 12. HARDENING — corrida real na CRIAÇÃO de PuzzleInstance. SELECT FOR
//     UPDATE não bloqueia uma linha inexistente, então travar
//     PuzzleParticipant/PuzzleInstance (que podem não existir ainda) não
//     serializava nada — 2 réplicas concorrentes podiam as duas "não
//     encontrar" e as duas criarem uma Instance+Participant cada. A
//     correção trava o Character (linha estável que SEMPRE existe)
//     antes de procurar/decidir. Isto dispara 2 chamadas de verdade via
//     Promise.allSettled (2 transactions/round-trips reais, não 2
//     chamadas sequenciais em memória).
// ---------------------------------------------------------------------

testeComBanco(
  "criarOuObterInstancia: 2 chamadas concorrentes pro MESMO personagem nunca criam 2 Instances — exatamente 1 instância e 1 participante",
  async () => {
    const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
    const { personagem } = await criarPersonagem({ nivel: 5 });

    const resultados = await Promise.allSettled([
      puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
        id: personagem.id,
        nome: personagem.nome,
      }),
      puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
        id: personagem.id,
        nome: personagem.nome,
      }),
    ]);

    const sucessos = resultados.filter((r) => r.status === "fulfilled");
    assert.equal(
      sucessos.length,
      2,
      "as 2 chamadas concorrentes terminam com sucesso (idempotência real, nunca erro/corrida)",
    );

    const ids = sucessos.map((r) => r.value.instancia.id);
    assert.equal(ids[0], ids[1], "as 2 chamadas terminam referenciando a MESMA PuzzleInstance");

    const criadas = sucessos.filter((r) => r.value.criada === true);
    assert.equal(criadas.length, 1, "exatamente 1 das 2 chamadas de fato CRIA a instância; a outra recupera");

    const totalInstancias = await PuzzleInstance.count({ where: { id_event_edition: edicao.id } });
    assert.equal(
      totalInstancias,
      1,
      "nunca existem 2 PuzzleInstances CREATED/ACTIVE pro mesmo personagem+blueprint+edição",
    );

    const totalParticipantes = await PuzzleParticipant.count({ where: { id_personagem: personagem.id } });
    assert.equal(totalParticipantes, 1, "exatamente 1 Participant correspondente");
  },
);

// ---------------------------------------------------------------------
// 13. HARDENING — invariantes de lifecycle cruzado entre EventDefinition
//     e seus filhos. Nenhum desses depende só da listagem pública
//     (listarAtivasPublicas) — cada service revalida por si só.
// ---------------------------------------------------------------------

testeComBanco("DRAFT definition + tentar ACTIVE edition → rejeita", async () => {
  const definicao = await eventDefinitionService.criar({ key: `def-${slug()}`, nome: "Teste" });
  const edicao = await eventEditionService.criar(definicao.id, { key: `ed-${slug()}`, nome: "Teste" });
  await assert.rejects(
    () => eventEditionService.transicionar(edicao.id, "ACTIVE"),
    (e) => e.statusCode === 409 && e.code === "EVENTO_NAO_PUBLICADO",
  );
});

testeComBanco("ARCHIVED definition + tentar criar edition → rejeita", async () => {
  const definicao = await eventDefinitionService.criar({ key: `def-${slug()}`, nome: "Teste" });
  await eventDefinitionService.transicionar(definicao.id, "ARCHIVED");
  await assert.rejects(
    () => eventEditionService.criar(definicao.id, { key: `ed-${slug()}`, nome: "Teste" }),
    (e) => e.statusCode === 409,
  );
});

testeComBanco("ARCHIVED definition + tentar criar blueprint → rejeita", async () => {
  const definicao = await eventDefinitionService.criar({ key: `def-${slug()}`, nome: "Teste" });
  await eventDefinitionService.transicionar(definicao.id, "ARCHIVED");
  await assert.rejects(
    () => puzzleBlueprintService.criarBlueprint(definicao.id, { key: `bp-${slug()}`, nome: "Teste" }),
    (e) => e.statusCode === 409,
  );
});

testeComBanco("DRAFT definition + tentar PUBLISH blueprint version → rejeita", async () => {
  const definicao = await eventDefinitionService.criar({ key: `def-${slug()}`, nome: "Teste" });
  const { versao } = await puzzleBlueprintService.criarBlueprint(definicao.id, {
    key: `bp-${slug()}`,
    nome: "Teste",
  });
  await assert.rejects(
    () => puzzleBlueprintService.transicionar(versao.id, "PUBLISHED"),
    (e) => e.statusCode === 409 && e.code === "EVENTO_NAO_PUBLICADO",
  );
});

testeComBanco("ARCHIVED definition + tentar PUBLISH blueprint version → rejeita", async () => {
  const definicao = await eventDefinitionService.criar({ key: `def-${slug()}`, nome: "Teste" });
  const { versao } = await puzzleBlueprintService.criarBlueprint(definicao.id, {
    key: `bp-${slug()}`,
    nome: "Teste",
  });
  await eventDefinitionService.transicionar(definicao.id, "ARCHIVED");
  await assert.rejects(
    () => puzzleBlueprintService.transicionar(versao.id, "PUBLISHED"),
    (e) => e.statusCode === 409 && e.code === "EVENTO_NAO_PUBLICADO",
  );
});

testeComBanco(
  "ACTIVE edition de definition não-PUBLISHED nunca permite criar Instance (defesa em profundidade — nunca confia só na listagem pública)",
  async () => {
    const { definicao, edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
    const { personagem } = await criarPersonagem({ nivel: 5 });

    // Simula um estado de borda em que a definição foi arquivada por
    // fora do fluxo normal (ex.: dado legado), SEM passar pelo guard de
    // eventDefinitionService.transicionar — a edição continua ACTIVE.
    // A criação de Instance precisa recusar de qualquer forma.
    await EventDefinition.update({ status: "ARCHIVED" }, { where: { id: definicao.id } });

    await assert.rejects(
      () =>
        puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
          id: personagem.id,
          nome: personagem.nome,
        }),
      (e) => e.statusCode === 409 && e.code === "EVENTO_NAO_PUBLICADO",
    );
  },
);

testeComBanco("tentar ARCHIVE definition com edição ACTIVE → rejeita", async () => {
  const { definicao } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
  await assert.rejects(
    () => eventDefinitionService.transicionar(definicao.id, "ARCHIVED"),
    (e) => e.statusCode === 409 && e.code === "EDICOES_PENDENTES",
  );
});

testeComBanco("tentar ARCHIVE definition com edição SCHEDULED também rejeita", async () => {
  const definicao = await eventDefinitionService.criar({ key: `def-${slug()}`, nome: "Teste" });
  await eventDefinitionService.transicionar(definicao.id, "PUBLISHED");
  const edicao = await eventEditionService.criar(definicao.id, { key: `ed-${slug()}`, nome: "Teste" });
  await eventEditionService.transicionar(edicao.id, "SCHEDULED");
  await assert.rejects(
    () => eventDefinitionService.transicionar(definicao.id, "ARCHIVED"),
    (e) => e.statusCode === 409 && e.code === "EDICOES_PENDENTES",
  );
});

testeComBanco("após END das edições, ARCHIVE funciona normalmente", async () => {
  const { definicao, edicao } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
  await eventEditionService.transicionar(edicao.id, "ENDED");
  const arquivada = await eventDefinitionService.transicionar(definicao.id, "ARCHIVED");
  assert.equal(arquivada.status, "ARCHIVED");
});

// ---------------------------------------------------------------------
// 14. HARDENING — limite real de PuzzleInstance.state (MAX_STATE_BYTES).
//     O limite HTTP de 100kb do Express não é suficiente por si só
//     porque o state também é produzido internamente pelo servidor.
// ---------------------------------------------------------------------

testeComBanco("aplicarMutacao rejeita novoState que não é objeto JSON (string)", async () => {
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  await assert.rejects(
    () => puzzleInstanceService.aplicarMutacao(instancia.id, 0, { novoState: "não é objeto" }),
    (e) => e.statusCode === 400,
  );
});

testeComBanco("aplicarMutacao rejeita array como raiz de novoState", async () => {
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  await assert.rejects(
    () => puzzleInstanceService.aplicarMutacao(instancia.id, 0, { novoState: [1, 2, 3] }),
    (e) => e.statusCode === 400,
  );
});

testeComBanco(
  "aplicarMutacao rejeita novoState acima de MAX_STATE_BYTES, mesmo produzido internamente pelo servidor",
  async () => {
    const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
    const { personagem } = await criarPersonagem({ nivel: 5 });
    const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
      id: personagem.id,
      nome: personagem.nome,
    });
    const estadoGigante = { public: { lixo: "x".repeat(puzzleInstanceService.MAX_STATE_BYTES + 1) } };
    await assert.rejects(
      () => puzzleInstanceService.aplicarMutacao(instancia.id, 0, { novoState: estadoGigante }),
      (e) => e.statusCode === 400,
    );
    const recarregada = await PuzzleInstance.findByPk(instancia.id);
    assert.equal(recarregada.state_version, 0, "a tentativa rejeitada nunca incrementa state_version");
  },
);

// ---------------------------------------------------------------------
// 15. HARDENING — criarNovaVersao é seguro POR SI SÓ, mesmo sem o
//     chamador fornecer uma transaction. Prova de concorrência real:
//     2 criações simultâneas da MESMA blueprint nunca colidem/500.
// ---------------------------------------------------------------------

testeComBanco(
  "criarNovaVersao: 2 criações concorrentes da mesma blueprint nunca colidem — versões distintas e monotônicas",
  async () => {
    const { blueprint } = await sequelize.transaction((t) => criarFundacaoCompleta(t));

    const resultados = await Promise.allSettled([
      puzzleBlueprintService.criarNovaVersao(blueprint.id, { config: { titulo_publico: "A" } }),
      puzzleBlueprintService.criarNovaVersao(blueprint.id, { config: { titulo_publico: "B" } }),
    ]);

    const sucessos = resultados.filter((r) => r.status === "fulfilled");
    assert.equal(sucessos.length, 2, "as 2 criações concorrentes terminam com sucesso, nunca 500 por colisão");

    const versoes = sucessos.map((r) => r.value.version).sort((a, b) => a - b);
    assert.deepEqual(versoes, [2, 3], "versões distintas e monotônicas (a v1 já existia da fundação)");

    const total = await PuzzleBlueprintVersion.count({ where: { id_blueprint: blueprint.id } });
    assert.equal(total, 3, "nenhuma versão perdida nem duplicada");
  },
);

testeComBanco(
  "criarNovaVersao sem transaction fornecida pelo chamador ainda é seguro (abre a própria transaction)",
  async () => {
    const { blueprint } = await sequelize.transaction((t) => criarFundacaoCompleta(t));
    const v2 = await puzzleBlueprintService.criarNovaVersao(blueprint.id, { config: {} }); // sem 3º argumento
    assert.equal(v2.version, 2);
    assert.equal(v2.status, "DRAFT");
  },
);

testeComBanco("criarNovaVersao rejeita quando o evento-pai já foi arquivado", async () => {
  const definicao = await eventDefinitionService.criar({ key: `def-${slug()}`, nome: "Teste" });
  const { blueprint } = await puzzleBlueprintService.criarBlueprint(definicao.id, {
    key: `bp-${slug()}`,
    nome: "Teste",
  });
  await eventDefinitionService.transicionar(definicao.id, "ARCHIVED");
  await assert.rejects(
    () => puzzleBlueprintService.criarNovaVersao(blueprint.id, { config: {} }),
    (e) => e.statusCode === 409,
  );
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
