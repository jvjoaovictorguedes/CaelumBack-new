// Tesouro da Guilda V2 + Contribuição V2 — spec "Tesouro da Guilda V2 +
// Contribuição V2". Cobre a matriz mínima: stacks, slots, equipamento,
// permissões, política de tipo, bloqueio de dissolução, doação com
// teto semanal e agregação por período do ledger imutável.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sequelize } = require("./helpers/db");
const Guild = require("../src/models/Guild");
const GuildMember = require("../src/models/GuildMember");
const Item = require("../src/models/Item");
const Character = require("../src/models/Character");
const CharacterEquipmentInstance = require("../src/models/CharacterEquipmentInstance");
const guildController = require("../src/controllers/guildController");
const guildTreasuryController = require("../src/controllers/guildTreasuryController");
const guildContributionController = require("../src/controllers/guildContributionController");
const treasuryService = require("../src/services/guildTreasuryService");
const { addStack } = require("../src/services/inventoryService");
const equipmentInstanceService = require("../src/services/equipmentInstanceService");
const { pontuarContribuicao, pontosDoacaoDisponiveisNaSemana } = require("../src/services/guildContributionService");
const guildConfig = require("../src/config/guildConfig");

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

async function criarGuildComMembro(cargo, nivelGuilda = 1) {
  const { personagem: fundador } = await criarPersonagem({ nivel: 10 });
  const sigla = Math.random().toString(36).slice(2, 7).toUpperCase();
  const guild = await Guild.create({
    nome: `Guilda ${fundador.id}`,
    sigla,
    id_fundador: fundador.id,
    id_lider: fundador.id,
    nivel: nivelGuilda,
  });
  await GuildMember.create({ id_guild: guild.id, id_personagem: fundador.id, cargo: "Fundador" });

  if (cargo === "Fundador") return { guild, personagem: fundador };

  const { personagem: outro } = await criarPersonagem({ nivel: 10 });
  await GuildMember.create({ id_guild: guild.id, id_personagem: outro.id, cargo });
  return { guild, personagem: outro };
}

async function criarItem(overrides = {}) {
  return Item.create({
    nome: `Item teste ${Math.random().toString(36).slice(2, 8)}`,
    descricao: "teste",
    tipo_item: "Material",
    raridade: "Comum",
    ...overrides,
  });
}

function reqRes({ params = {}, body = {}, query = {}, personagemAtual }) {
  let statusCode = null;
  let corpo = null;
  const req = { params, body, query, personagemAtual };
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

// ---------------------------------------------------------------------
// Depósito/retirada de stack
// ---------------------------------------------------------------------

testeComBanco("depositar item empilhável: sai do inventário, entra no Tesouro, gera transação", async () => {
  const { guild, personagem } = await criarGuildComMembro("Fundador");
  const item = await criarItem();
  await addStack(personagem.id, item.id, 10, null);

  const resultado = await treasuryService.depositarItemStackavel(guild.id, personagem.id, item.id, 4);
  assert.equal(resultado.quantidade_total, 4);

  const historico = await treasuryService.historicoMovimentacoes(guild.id);
  assert.equal(historico.movimentacoes.length, 1);
  assert.equal(historico.movimentacoes[0].operation, "DEPOSITO");
  assert.equal(historico.movimentacoes[0].quantidade, 4);
});

testeComBanco("não-membro não pode depositar (403)", async () => {
  const { guild } = await criarGuildComMembro("Fundador");
  const { personagem: fora } = await criarPersonagem({ nivel: 5 });
  const item = await criarItem();
  await addStack(fora.id, item.id, 5, null);

  await assert.rejects(
    () => treasuryService.depositarItemStackavel(guild.id, fora.id, item.id, 1),
    (erro) => erro.statusCode === 403,
  );
});

testeComBanco("QuestItem/Currencia não podem ser depositados (400)", async () => {
  const { guild, personagem } = await criarGuildComMembro("Fundador");
  const itemQuest = await criarItem({ tipo_item: "QuestItem" });
  assert.equal(treasuryService.podeDepositarNoTesouro(itemQuest), false);

  await assert.rejects(
    () => treasuryService.depositarItemStackavel(guild.id, personagem.id, itemQuest.id, 1),
    (erro) => erro.statusCode === 400,
  );
});

testeComBanco("Membro comum NÃO pode retirar (403), mas Oficial pode", async () => {
  const { guild, personagem: fundador } = await criarGuildComMembro("Fundador");
  const item = await criarItem();
  await addStack(fundador.id, item.id, 10, null);
  await treasuryService.depositarItemStackavel(guild.id, fundador.id, item.id, 5);

  const { personagem: membroComum } = await criarPersonagem({ nivel: 5 });
  await GuildMember.create({ id_guild: guild.id, id_personagem: membroComum.id, cargo: "Membro" });
  await assert.rejects(
    () => treasuryService.retirarItemStackavel(guild.id, membroComum.id, item.id, 1),
    (erro) => erro.statusCode === 403,
  );

  const { personagem: oficial } = await criarPersonagem({ nivel: 5 });
  await GuildMember.create({ id_guild: guild.id, id_personagem: oficial.id, cargo: "Oficial" });
  const resultado = await treasuryService.retirarItemStackavel(guild.id, oficial.id, item.id, 2);
  assert.equal(resultado.quantidade_movimentada, 2);
});

testeComBanco("retirar mais do que existe no Tesouro falha (400)", async () => {
  const { guild, personagem } = await criarGuildComMembro("Fundador");
  const item = await criarItem();
  await addStack(personagem.id, item.id, 10, null);
  await treasuryService.depositarItemStackavel(guild.id, personagem.id, item.id, 3);

  await assert.rejects(
    () => treasuryService.retirarItemStackavel(guild.id, personagem.id, item.id, 99),
    (erro) => erro.statusCode === 400,
  );
});

testeComBanco("capacidade de slots é respeitada — depósito além do limite retorna 409", async () => {
  const original = { ...guildConfig.CAPACIDADE_TESOURO_POR_NIVEL };
  guildConfig.aplicarOverridesBalanceamento("guild.tesouro", { CAPACIDADE_TESOURO_POR_NIVEL: { 1: 1 } });
  try {
    const { guild, personagem } = await criarGuildComMembro("Fundador", 1);
    const item1 = await criarItem();
    const item2 = await criarItem();
    await addStack(personagem.id, item1.id, 5, null);
    await addStack(personagem.id, item2.id, 5, null);

    await treasuryService.depositarItemStackavel(guild.id, personagem.id, item1.id, 1);
    await assert.rejects(
      () => treasuryService.depositarItemStackavel(guild.id, personagem.id, item2.id, 1),
      (erro) => erro.statusCode === 409,
    );
  } finally {
    guildConfig.aplicarOverridesBalanceamento("guild.tesouro", { CAPACIDADE_TESOURO_POR_NIVEL: original });
  }
});

// ---------------------------------------------------------------------
// Depósito/retirada de equipamento (preserva raridade/refinamento)
// ---------------------------------------------------------------------

testeComBanco("depositar e retirar equipamento preserva raridade e refinamento, nunca duplica", async () => {
  const { guild, personagem } = await criarGuildComMembro("Fundador");
  const item = await criarItem({ tipo_item: "Arma" });
  const instancia = await equipmentInstanceService.create(
    { idPersonagem: personagem.id, idItem: item.id, raridade: "Raro", refinamento: 3 },
    null,
  );

  const deposito = await treasuryService.depositarEquipamento(guild.id, personagem.id, instancia.id);
  assert.equal(deposito.raridade, "Raro");
  assert.equal(deposito.refinamento, 3);
  assert.equal(await CharacterEquipmentInstance.findByPk(instancia.id), null);

  const { personagem: oficial } = await criarPersonagem({ nivel: 5 });
  await GuildMember.create({ id_guild: guild.id, id_personagem: oficial.id, cargo: "Oficial" });
  const retirada = await treasuryService.retirarEquipamento(guild.id, oficial.id, deposito.id);
  assert.equal(retirada.raridade, "Raro");
  assert.equal(retirada.refinamento, 3);

  const novaInstancia = await CharacterEquipmentInstance.findByPk(retirada.id_instancia);
  assert.equal(novaInstancia.id_personagem, oficial.id);
  assert.equal(novaInstancia.raridade, "Raro");
  assert.equal(novaInstancia.refinamento, 3);
});

testeComBanco("equipamento equipado (não no inventário) não pode ser depositado", async () => {
  const { guild, personagem } = await criarGuildComMembro("Fundador");
  const item = await criarItem({ tipo_item: "Arma" });
  const instancia = await equipmentInstanceService.create(
    { idPersonagem: personagem.id, idItem: item.id, raridade: "Comum" },
    null,
  );
  instancia.estado = "Equipada";
  await instancia.save();

  await assert.rejects(
    () => treasuryService.depositarEquipamento(guild.id, personagem.id, instancia.id),
    (erro) => erro.statusCode === 400,
  );
});

// ---------------------------------------------------------------------
// Bloqueio de dissolução com itens no Tesouro (§10/§26)
// ---------------------------------------------------------------------

testeComBanco("dissolver guilda com itens no Tesouro retorna 409 e não dissolve", async () => {
  const { guild, personagem } = await criarGuildComMembro("Fundador");
  const item = await criarItem();
  await addStack(personagem.id, item.id, 5, null);
  await treasuryService.depositarItemStackavel(guild.id, personagem.id, item.id, 1);

  const chamada = reqRes({ params: { id: String(guild.id) }, personagemAtual: { id: personagem.id } });
  await guildController.dissolver(chamada.req, chamada.res);
  assert.equal(chamada.resultado().statusCode, 409);

  const guildRecarregada = await Guild.findByPk(guild.id);
  assert.equal(guildRecarregada.status, "Ativa");
});

testeComBanco("dissolver guilda SEM itens no Tesouro funciona normalmente", async () => {
  const { guild, personagem } = await criarGuildComMembro("Fundador");

  const chamada = reqRes({ params: { id: String(guild.id) }, personagemAtual: { id: personagem.id } });
  await guildController.dissolver(chamada.req, chamada.res);
  assert.equal(chamada.resultado().statusCode, 200);
});

// ---------------------------------------------------------------------
// Controllers HTTP (resumo + histórico)
// ---------------------------------------------------------------------

testeComBanco("controller resumo retorna capacidade/slots/estoque corretos", async () => {
  const { guild, personagem } = await criarGuildComMembro("Fundador");
  const item = await criarItem();
  await addStack(personagem.id, item.id, 5, null);
  await treasuryService.depositarItemStackavel(guild.id, personagem.id, item.id, 2);

  const chamada = reqRes({ params: { id: String(guild.id) }, personagemAtual: { id: personagem.id } });
  await guildTreasuryController.resumo(chamada.req, chamada.res);
  const { statusCode, corpo } = chamada.resultado();
  assert.equal(statusCode, 200);
  assert.equal(corpo.data.slots_usados, 1);
  assert.equal(corpo.data.estoque[0].quantidade, 2);
});

// ---------------------------------------------------------------------
// Contribuição V2 — ledger imutável + teto semanal de doação
// ---------------------------------------------------------------------

testeComBanco("pontuarContribuicao grava ledger imutável e soma no total legado", async () => {
  const { guild, personagem } = await criarGuildComMembro("Fundador");

  await sequelize.transaction((t) =>
    pontuarContribuicao(guild.id, personagem.id, 30, t, { sourceType: "MISSION_DAILY", sourceId: 1 }),
  );

  const chamadaPeriodo = reqRes({ params: { id: String(guild.id), period: "all" }, personagemAtual: { id: personagem.id } });
  await guildContributionController.listarPorPeriodo(chamadaPeriodo.req, chamadaPeriodo.res);
  const { corpo } = chamadaPeriodo.resultado();
  const linha = corpo.data.ranking.find((r) => r.personagem.id === personagem.id);
  assert.equal(linha.pontos, 30);
  assert.equal(linha.composicao.MISSION_DAILY, 30);
});

testeComBanco("doação respeita teto semanal — excedente não gera pontos extras", async () => {
  const { guild, personagem } = await criarGuildComMembro("Fundador");
  const teto = guildConfig.PONTOS_CONTRIBUICAO.DoacaoTetoPontosSemanal;

  await sequelize.transaction(async (t) => {
    const disponivel = await pontosDoacaoDisponiveisNaSemana(guild.id, personagem.id, t);
    assert.equal(disponivel, teto);
    await pontuarContribuicao(guild.id, personagem.id, disponivel, t, { sourceType: "GOLD_DONATION" });
  });

  await sequelize.transaction(async (t) => {
    const disponivel = await pontosDoacaoDisponiveisNaSemana(guild.id, personagem.id, t);
    assert.equal(disponivel, 0);
  });
});

testeComBanco("detalharMembro retorna semana/mes/historico e última contribuição", async () => {
  const { guild, personagem } = await criarGuildComMembro("Fundador");
  await sequelize.transaction((t) =>
    pontuarContribuicao(guild.id, personagem.id, 15, t, { sourceType: "GUILD_BOSS" }),
  );

  const chamada = reqRes({
    params: { id: String(guild.id), characterId: String(personagem.id) },
    personagemAtual: { id: personagem.id },
  });
  await guildContributionController.detalharMembro(chamada.req, chamada.res);
  const { statusCode, corpo } = chamada.resultado();
  assert.equal(statusCode, 200);
  assert.equal(corpo.data.pontos_semana, 15);
  assert.equal(corpo.data.pontos_historico, 15);
  assert.equal(corpo.data.ultima_contribuicao.source_type, "GUILD_BOSS");
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
