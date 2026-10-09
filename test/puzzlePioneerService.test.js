// Evento "O Coração da Máquina Celestial" — Fase 10 (Discovery/Pioneer).
// Cobre: validação do catálogo admin (criarMilestone), a garantia real
// da corrida (nunca 2 jogadores ganham a mesma posição, mesmo sob
// concorrência de verdade via Promise.all — não só chamadas
// sequenciais), max_claims > 1 (pódio), idempotência (mesmo jogador
// nunca duplica claim), o Quadro de Honra (sempre público, mesmo sem
// claims) e integração com o pipeline real de ações da Fase 8.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const { PuzzlePioneerClaim } = require("../src/models/eventPuzzleModels");

const eventDefinitionService = require("../src/services/eventDefinitionService");
const eventEditionService = require("../src/services/eventEditionService");
const puzzleBlueprintService = require("../src/services/puzzleBlueprintService");
const puzzleInstanceService = require("../src/services/puzzleInstanceService");
const puzzleActionService = require("../src/services/puzzleActionService");
const puzzlePioneerService = require("../src/services/puzzlePioneerService");

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

function configCamaraDasEngrenagens() {
  return {
    dominio: "MECANICO",
    components: [
      { id: "motor1", type: "MOTOR", props: { rpmNominal: 120, sentido: "CW" } },
      { id: "gear1", type: "GEAR", props: { dentes: 20 } },
      { id: "gear2", type: "GEAR", props: { dentes: 40 } },
      { id: "clutch1", type: "CLUTCH", props: {} },
      { id: "output1", type: "OUTPUT", props: { rpmAlvo: 60, sentidoAlvo: "CCW", toleranciaRpm: 0 } },
      { id: "lever1", type: "LEVER", props: {} },
    ],
    connections: [
      { id: "c1", from: { componentId: "motor1", port: "out" }, to: { componentId: "gear1", port: "in" } },
      { id: "c2", from: { componentId: "gear1", port: "out" }, to: { componentId: "gear2", port: "in" } },
      { id: "c3", from: { componentId: "gear2", port: "out" }, to: { componentId: "clutch1", port: "in" } },
      { id: "c4", from: { componentId: "clutch1", port: "out" }, to: { componentId: "output1", port: "in" } },
    ],
    objectives: [
      { id: "obj_rotacao", descricao: "Atingir a rotação de saída", condicao: { op: "EQUALS", path: "components.output1.atingido", value: true } },
      { id: "obj_alavanca", descricao: "Acionar a alavanca cerimonial", condicao: { op: "EQUALS", path: "components.lever1.acionada", value: true } },
    ],
  };
}

const GOLDEN_SOLUTION = [
  { type: "LIGAR", componentId: "motor1" },
  { type: "ENGATAR", componentId: "clutch1" },
  { type: "ACIONAR", componentId: "lever1" },
];

async function criarFundacaoComDominio(config, transaction) {
  const chave = slug();
  const definicao = await eventDefinitionService.criar({ key: `evento-${chave}`, nome: `Evento ${chave}` }, transaction);
  await eventDefinitionService.transicionar(definicao.id, "PUBLISHED", transaction);

  const edicao = await eventEditionService.criar(definicao.id, { key: `edicao-${chave}`, nome: `Edição ${chave}` }, transaction);
  await eventEditionService.transicionar(edicao.id, "ACTIVE", transaction);

  const { blueprint, versao } = await puzzleBlueprintService.criarBlueprint(
    definicao.id,
    { key: `puzzle-${chave}`, nome: `Puzzle ${chave}` },
    transaction,
  );
  await puzzleBlueprintService.atualizarDraft(versao.id, { config }, transaction);
  const versaoPublicada = await puzzleBlueprintService.transicionar(versao.id, "PUBLISHED", {}, transaction);

  return { definicao, edicao, blueprint, versao: versaoPublicada };
}

// ---------------------------------------------------------------------
// 1. Catálogo admin — validações
// ---------------------------------------------------------------------

testeComBanco("criarMilestone: exige objectiveId quando OBJECTIVE_COMPLETED, proíbe quando INSTANCE_COMPLETED, maxClaims padrão 1", async () => {
  const { blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio({ dominio: "MECANICO", components: [] }, t));

  await assert.rejects(
    () =>
      puzzlePioneerService.criarMilestone(blueprint.id, {
        key: "marco-1",
        titulo: "Marco 1",
        descricao: "Desc 1",
        triggerType: "OBJECTIVE_COMPLETED",
      }),
    (e) => e.statusCode === 400,
  );

  const ok = await puzzlePioneerService.criarMilestone(blueprint.id, {
    key: "marco-2",
    titulo: "Marco 2",
    descricao: "Desc 2",
    triggerType: "INSTANCE_COMPLETED",
  });
  assert.equal(ok.max_claims, 1, "default de maxClaims é 1 (o pioneiro de verdade)");
});

testeComBanco("criarMilestone: maxClaims precisa ser inteiro >= 1", async () => {
  const { blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio({ dominio: "MECANICO", components: [] }, t));
  await assert.rejects(
    () =>
      puzzlePioneerService.criarMilestone(blueprint.id, {
        key: "marco-invalido",
        titulo: "Marco",
        descricao: "Desc",
        triggerType: "INSTANCE_COMPLETED",
        maxClaims: 0,
      }),
    (e) => e.statusCode === 400,
  );
  const ok = await puzzlePioneerService.criarMilestone(blueprint.id, {
    key: "podio",
    titulo: "Pódio",
    descricao: "Os 3 primeiros",
    triggerType: "INSTANCE_COMPLETED",
    maxClaims: 3,
  });
  assert.equal(ok.max_claims, 3);
});

// ---------------------------------------------------------------------
// 2. A GARANTIA REAL DA CORRIDA — concorrência de verdade (Promise.all)
// ---------------------------------------------------------------------

testeComBanco("PROVA DE ATOMICIDADE REAL: 5 personagens 'terminando ao mesmo tempo' um marco de 1 vaga só — exatamente 1 vence", async () => {
  const { blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio({ dominio: "MECANICO", components: [] }, t));
  const marco = await puzzlePioneerService.criarMilestone(blueprint.id, {
    key: "unico",
    titulo: "O Primeiro",
    descricao: "Só existe um pioneiro.",
    triggerType: "INSTANCE_COMPLETED",
  });

  const personagens = [];
  for (let i = 0; i < 5; i += 1) {
    const { personagem } = await criarPersonagem({ nivel: 5 });
    personagens.push(personagem);
  }

  // 5 chamadas de verdade pro Postgres via Promise.all — não 5 chamadas
  // sequenciais (que nunca provariam nada sobre concorrência real).
  const resultados = await Promise.all(
    personagens.map((p) =>
      puzzlePioneerService.sincronizarConquistas({
        idPersonagem: p.id,
        idBlueprint: blueprint.id,
        objetivosConcluidos: [],
        completou: true,
      }),
    ),
  );

  const vencedores = resultados.filter((r) => r.length > 0);
  assert.equal(vencedores.length, 1, "exatamente 1 personagem ganha a vaga única, nunca 0 nem 2+");
  assert.equal(vencedores[0][0].posicao, 1);

  const totalClaims = await PuzzlePioneerClaim.count({ where: { id_milestone: marco.id } });
  assert.equal(totalClaims, 1, "nunca mais de 1 linha no banco pro marco de 1 vaga só");
});

testeComBanco("PROVA DE ATOMICIDADE REAL: 5 personagens concorrendo por um pódio de 3 vagas — exatamente 3 vencem, posições 1/2/3 sem colisão", async () => {
  const { blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio({ dominio: "MECANICO", components: [] }, t));
  const marco = await puzzlePioneerService.criarMilestone(blueprint.id, {
    key: "podio-3",
    titulo: "Pódio",
    descricao: "Os 3 primeiros.",
    triggerType: "INSTANCE_COMPLETED",
    maxClaims: 3,
  });

  const personagens = [];
  for (let i = 0; i < 5; i += 1) {
    const { personagem } = await criarPersonagem({ nivel: 5 });
    personagens.push(personagem);
  }

  const resultados = await Promise.all(
    personagens.map((p) =>
      puzzlePioneerService.sincronizarConquistas({
        idPersonagem: p.id,
        idBlueprint: blueprint.id,
        objetivosConcluidos: [],
        completou: true,
      }),
    ),
  );

  const vencedores = resultados.filter((r) => r.length > 0).map((r) => r[0]);
  assert.equal(vencedores.length, 3, "exatamente 3 dos 5 ganham vaga no pódio de 3");

  const posicoes = vencedores.map((v) => v.posicao).sort();
  assert.deepEqual(posicoes, [1, 2, 3], "posições 1, 2 e 3 cada uma usada exatamente 1x — nunca colisão");

  const totalClaims = await PuzzlePioneerClaim.count({ where: { id_milestone: marco.id } });
  assert.equal(totalClaims, 3);
});

// ---------------------------------------------------------------------
// 3. Idempotência — mesmo personagem nunca duplica, nem rouba vaga própria
// ---------------------------------------------------------------------

testeComBanco("sincronizarConquistas: reavaliar o MESMO personagem 2x nunca duplica claim nem conta 2 vagas", async () => {
  const { blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio({ dominio: "MECANICO", components: [] }, t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  await puzzlePioneerService.criarMilestone(blueprint.id, {
    key: "unico-2",
    titulo: "O Único",
    descricao: "Desc.",
    triggerType: "OBJECTIVE_COMPLETED",
    objectiveId: "obj_rotacao",
  });

  const payload = {
    idPersonagem: personagem.id,
    idBlueprint: blueprint.id,
    objetivosConcluidos: ["obj_rotacao"],
    completou: false,
  };
  const primeira = await puzzlePioneerService.sincronizarConquistas(payload);
  assert.equal(primeira.length, 1);
  assert.equal(primeira[0].posicao, 1);

  const segunda = await puzzlePioneerService.sincronizarConquistas(payload);
  assert.deepEqual(segunda, [], "a 2ª sincronização não reporta nada — já tinha a vaga");

  const linhas = await PuzzlePioneerClaim.count({
    where: { id_milestone: primeira[0].id_milestone, id_personagem: personagem.id },
  });
  assert.equal(linhas, 1);
});

// ---------------------------------------------------------------------
// 4. Quadro de Honra — sempre público, mesmo sem claims (teaser)
// ---------------------------------------------------------------------

testeComBanco("obterQuadroDeHonra: titulo/descricao sempre visíveis, mesmo sem nenhuma conquista ainda", async () => {
  const { definicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio({ dominio: "MECANICO", components: [] }, t));
  await puzzlePioneerService.criarMilestone(blueprint.id, {
    key: "ainda-nao",
    titulo: "O Desafio Supremo",
    descricao: "Ninguém conseguiu isso ainda.",
    triggerType: "INSTANCE_COMPLETED",
  });

  const quadro = await puzzlePioneerService.obterQuadroDeHonra(definicao.id);
  assert.equal(quadro.length, 1);
  assert.equal(quadro[0].titulo, "O Desafio Supremo");
  assert.equal(quadro[0].descricao, "Ninguém conseguiu isso ainda.");
  assert.deepEqual(quadro[0].conquistas, []);

  const { personagem } = await criarPersonagem({ nivel: 5 });
  await puzzlePioneerService.sincronizarConquistas({
    idPersonagem: personagem.id,
    idBlueprint: blueprint.id,
    objetivosConcluidos: [],
    completou: true,
  });

  const quadroDepois = await puzzlePioneerService.obterQuadroDeHonra(definicao.id);
  assert.equal(quadroDepois[0].conquistas.length, 1);
  assert.equal(quadroDepois[0].conquistas[0].nome, personagem.nome);
  assert.equal(quadroDepois[0].conquistas[0].posicao, 1);
});

// ---------------------------------------------------------------------
// 5. Integração com o pipeline real de ações (Fase 8)
// ---------------------------------------------------------------------

testeComBanco("integração: golden solution real conquista o marco Pioneer na ação exata que completa o puzzle", async () => {
  const config = configCamaraDasEngrenagens();
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio(config, t));
  const { personagem } = await criarPersonagem({ nivel: 5 });

  const marco = await puzzlePioneerService.criarMilestone(blueprint.id, {
    key: "pioneiro-camara",
    titulo: "Pioneiro da Câmara",
    descricao: "Primeiro a resolver a Câmara das Engrenagens.",
    triggerType: "INSTANCE_COMPLETED",
  });

  const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: personagem.id,
    nome: personagem.nome,
  });

  let versaoEsperada = 0;
  const conquistasPorAcao = [];
  for (const acao of GOLDEN_SOLUTION) {
    const { conquistasPioneiras } = await puzzleActionService.executarAcao(instancia.id, personagem.id, acao, versaoEsperada);
    versaoEsperada += 1;
    conquistasPorAcao.push(conquistasPioneiras);
  }

  assert.deepEqual(conquistasPorAcao[0], []);
  assert.deepEqual(conquistasPorAcao[1], []);
  assert.equal(conquistasPorAcao[2].length, 1, "a ação que completa o puzzle (ACIONAR lever1) é a que conquista o marco");
  assert.equal(conquistasPorAcao[2][0].id_milestone, marco.id);
  assert.equal(conquistasPorAcao[2][0].posicao, 1);
});
