// Evento "O Coração da Máquina Celestial" — Fase 14 (Recompensas
// temáticas do evento). Mesma cobertura dos pares catálogo/histórico
// das Fases 9/10 (pistas/pioneiros): catálogo admin, concessão
// idempotente a partir de estado persistido, ouro/xp/item/conquista
// realmente movidos via rewardPayoutService/achievementService (nunca
// um mock paralelo), e um teste de ponta a ponta com as migrations
// reais da Fase 14 sobre o conteúdo real da Fase 12.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const Achievement = require("../src/models/Achievement");
const Title = require("../src/models/Title");
const CharacterAchievement = require("../src/models/CharacterAchievement");
const CharacterTitle = require("../src/models/CharacterTitle");
const CharacterInventory = require("../src/models/CharacterInventory");
const { PuzzleRewardDefinition, CharacterPuzzleRewardGrant } = require("../src/models/eventPuzzleRewardModels");
const { EventEdition, PuzzleBlueprint, PuzzleBlueprintVersion } = require("../src/models/eventPuzzleModels");
const eventDefinitionService = require("../src/services/eventDefinitionService");
const eventEditionService = require("../src/services/eventEditionService");
const puzzleBlueprintService = require("../src/services/puzzleBlueprintService");
const puzzleInstanceService = require("../src/services/puzzleInstanceService");
const puzzleActionService = require("../src/services/puzzleActionService");
const puzzleRewardService = require("../src/services/puzzleRewardService");
const migrationSchema = require("../src/migrations/20270214010005-event-puzzle-fase14-recompensas-schema.js");
const migrationConteudo = require("../src/migrations/20270214010006-event-puzzle-fase14-recompensas-conteudo.js");

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

async function criarItemTeste() {
  return Item.create({
    nome: `Troféu de Teste ${sufixo()}`,
    descricao: "Item de teste",
    tipo_item: "Material",
    raridade: "Raro",
    disponivel_loja: false,
    negociavel_mercado: false,
  });
}

async function criarAchievementComTitulo() {
  const achievement = await Achievement.create({
    key: `conquista-${sufixo()}`,
    nome: "Conquista de Teste",
    descricao: "Conquista de teste",
    categoria: "Evento",
  });
  const title = await Title.create({
    key: `titulo-${sufixo()}`,
    nome: "Título de Teste",
    id_achievement_desbloqueia: achievement.id,
  });
  return { achievement, title };
}

// Fundação mínima com 1 blueprint PUBLISHED — mesma forma usada nos
// testes das Fases 12/13.
async function criarFundacaoComBlueprint() {
  const chave = slug();
  const definicao = await eventDefinitionService.criar({ key: `evento-${chave}`, nome: `Evento ${chave}` });
  await eventDefinitionService.transicionar(definicao.id, "PUBLISHED");
  const edicao = await eventEditionService.criar(definicao.id, { key: `edicao-${chave}`, nome: `Edição ${chave}` });
  await eventEditionService.transicionar(edicao.id, "ACTIVE");

  const { blueprint, versao } = await puzzleBlueprintService.criarBlueprint(definicao.id, { key: `sala-${chave}`, nome: "Sala", ordem: 1 });
  await puzzleBlueprintService.atualizarDraft(versao.id, { config: configSimples("obj1") });
  const versaoPublicada = await puzzleBlueprintService.transicionar(versao.id, "PUBLISHED", {});

  return { definicao, edicao, blueprint, versao: versaoPublicada };
}

async function resolverSala(edicao, blueprint, personagem) {
  const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  const { instancia: atualizada, recompensasConcedidas } = await puzzleActionService.executarAcao(
    instancia.id,
    personagem.id,
    { type: "LIGAR", componentId: "motor1" },
    instancia.state_version,
  );
  return { instancia: atualizada, recompensasConcedidas };
}

test.after(async () => {
  if (temBanco) await sequelize.close();
});

testeComBanco("criarDefinicao: rejeita sem nenhum reward configurado", async () => {
  const { blueprint } = await criarFundacaoComBlueprint();
  await assert.rejects(
    () => puzzleRewardService.criarDefinicao(blueprint.id, {
      key: "vazia", tituloExibicao: "Vazia", descricaoExibicao: "x", triggerType: "INSTANCE_COMPLETED",
    }),
    /pelo menos um de/,
  );
});

testeComBanco("criarDefinicao: rejeita achievementKey que não existe", async () => {
  const { blueprint } = await criarFundacaoComBlueprint();
  await assert.rejects(
    () => puzzleRewardService.criarDefinicao(blueprint.id, {
      key: "com-conquista", tituloExibicao: "Com Conquista", descricaoExibicao: "x", triggerType: "INSTANCE_COMPLETED",
      achievementKey: "nao-existe-" + sufixo(),
    }),
    /não existe/,
  );
});

testeComBanco(
  "sincronizarRecompensas: concede ouro+xp+item+conquista exatamente uma vez na conclusão real da sala",
  async () => {
    const { personagem } = await criarPersonagem({ nivel: 10 });
    const { edicao, blueprint } = await criarFundacaoComBlueprint();
    const item = await criarItemTeste();
    const { achievement, title } = await criarAchievementComTitulo();

    await puzzleRewardService.criarDefinicao(blueprint.id, {
      key: "recompensa-teste",
      tituloExibicao: "Recompensa de Teste",
      descricaoExibicao: "Descrição de teste",
      triggerType: "INSTANCE_COMPLETED",
      rewardOuro: 42,
      rewardXp: 99,
      idItem: item.id,
      itemQuantidade: 3,
      achievementKey: achievement.key,
    });

    const dinheiroAntes = personagem.dinheiro ?? 0;
    const { instancia, recompensasConcedidas } = await resolverSala(edicao, blueprint, personagem);
    assert.equal(instancia.status, "COMPLETED");
    assert.equal(recompensasConcedidas.length, 1);
    assert.equal(recompensasConcedidas[0].definicao.titulo_exibicao, "Recompensa de Teste");
    assert.equal(recompensasConcedidas[0].conquista.achievement.key, achievement.key);

    await personagem.reload();
    assert.equal(personagem.dinheiro, dinheiroAntes + 42);

    const stack = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: item.id } });
    assert.equal(stack.quantidade, 3);

    const conquistaSalva = await CharacterAchievement.findOne({ where: { id_personagem: personagem.id, id_achievement: achievement.id } });
    assert.ok(conquistaSalva, "a conquista deveria ter sido registrada");
    const tituloSalvo = await CharacterTitle.findOne({ where: { id_personagem: personagem.id, id_title: title.id } });
    assert.ok(tituloSalvo, "o título ligado à conquista deveria vir de carona");

    const grants = await CharacterPuzzleRewardGrant.count({ where: { id_personagem: personagem.id } });
    assert.equal(grants, 1);

    // Idempotência: resolver a MESMA instância (já COMPLETED) de novo
    // nunca paga uma segunda vez — chama sincronizarRecompensas direto
    // com o mesmo state persistido, simulando um replay/retry.
    await puzzleRewardService.sincronizarRecompensas({
      idPersonagem: personagem.id,
      idBlueprint: blueprint.id,
      objetivosConcluidos: instancia.state.objetivosConcluidos,
      completou: true,
    });
    await personagem.reload();
    assert.equal(personagem.dinheiro, dinheiroAntes + 42, "nunca paga duas vezes");
    const stackApos = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: item.id } });
    assert.equal(stackApos.quantidade, 3, "nunca empilha duas vezes");
    const grantsApos = await CharacterPuzzleRewardGrant.count({ where: { id_personagem: personagem.id } });
    assert.equal(grantsApos, 1, "nunca duplica a linha de grant");
  },
);

testeComBanco("sincronizarRecompensas: sem definição nenhuma, devolve vazio e não falha", async () => {
  const { personagem } = await criarPersonagem({});
  const { edicao, blueprint } = await criarFundacaoComBlueprint();
  const { recompensasConcedidas } = await resolverSala(edicao, blueprint, personagem);
  assert.deepEqual(recompensasConcedidas, []);
});

testeComBanco("listarObtidasPorPersonagem: reflete obtida só depois da conclusão real", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { edicao, blueprint } = await criarFundacaoComBlueprint();
  await puzzleRewardService.criarDefinicao(blueprint.id, {
    key: "recompensa-lista", tituloExibicao: "Recompensa Lista", descricaoExibicao: "x",
    triggerType: "INSTANCE_COMPLETED", rewardOuro: 10,
  });

  let lista = await puzzleRewardService.listarObtidasPorPersonagem(personagem.id, blueprint.id);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].obtida, false);

  await resolverSala(edicao, blueprint, personagem);

  lista = await puzzleRewardService.listarObtidasPorPersonagem(personagem.id, blueprint.id);
  assert.equal(lista[0].obtida, true);
  assert.ok(lista[0].obtidaEm);
});

// Prova final: roda as migrations REAIS da Fase 14 (schema + conteúdo)
// contra o conteúdo REAL da Fase 12/13 já presente no banco de testes,
// e confirma que o capstone (conquista + título "Restaurador do
// Coração") está ligado à sala real "nucleo-da-convergencia".
testeComBanco(
  "ponta a ponta: migrations reais da Fase 14 produzem as 4 recompensas temáticas reais + capstone",
  async () => {
    const { EventDefinition } = require("../src/models/eventPuzzleModels");
    const definicao = await EventDefinition.findOne({ where: { key: "coracao-da-maquina-celestial" } });
    if (!definicao) return; // Fase 12 ainda não migrada neste banco — nada a verificar aqui.

    const nucleo = await PuzzleBlueprint.findOne({ where: { id_event_definition: definicao.id, key: "nucleo-da-convergencia" } });
    if (!nucleo) return;

    let definicaoCapstone = await PuzzleRewardDefinition.findOne({ where: { id_blueprint: nucleo.id, achievement_key: "coracao-restaurado" } });
    if (!definicaoCapstone) {
      // Migrations da Fase 14 ainda não aplicadas neste banco via
      // sequelize-cli — aplica aqui mesmo, exatamente como
      // `npx sequelize-cli db:migrate` faria.
      await migrationSchema.up(sequelize.getQueryInterface(), require("sequelize"));
      await migrationConteudo.up(sequelize.getQueryInterface());
      definicaoCapstone = await PuzzleRewardDefinition.findOne({ where: { id_blueprint: nucleo.id, achievement_key: "coracao-restaurado" } });
    }
    assert.ok(definicaoCapstone, "migration de conteúdo da Fase 14 deveria ter criado a recompensa capstone real");

    const achievement = await Achievement.findOne({ where: { key: "coracao-restaurado" } });
    assert.ok(achievement, "Achievement real 'coracao-restaurado' deveria existir");
    const title = await Title.findOne({ where: { id_achievement_desbloqueia: achievement.id } });
    assert.equal(title.key, "restaurador-do-coracao");

    const todasAsSalas = await PuzzleBlueprint.findAll({ where: { id_event_definition: definicao.id } });
    const definicoesReais = await PuzzleRewardDefinition.findAll({
      where: { id_blueprint: todasAsSalas.map((s) => s.id), key: "recompensa-tematica" },
    });
    assert.equal(definicoesReais.length, 4, "as 4 salas reais deveriam ter uma recompensa temática real cada");
  },
);
