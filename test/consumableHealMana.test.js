// Alquimia/Caldeirão V2 (spec §6.5) — migração de Poção de Vida/Mana pro
// motor de ConsumableEffect. Cobre, nesta ordem: os handlers novos
// (HEAL_HP_FLAT/PERCENT, RESTORE_MANA_FLAT/PERCENT) isolados, o service
// que os orquestra, e os 3 pontos de integração que precisam preferir o
// efeito moderno e NUNCA somar também o legado ConsumableProperties.
// efeito_vida/efeito_mana quando o item tem os dois configurados
// (combate PvE solo, uso fora de combate, e duelo PvP/Grupo via
// duelEngine).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const ConsumableProperties = require("../src/models/ConsumableProperties");
const ConsumableEffect = require("../src/models/ConsumableEffect");
const CharacterInventory = require("../src/models/CharacterInventory");
const combatController = require("../src/controllers/combatController");
const characterInventoryController = require("../src/controllers/characterInventoryController");
const consumableEffectService = require("../src/services/consumableEffectService");
const { executarEfeito } = require("../src/services/consumableEffectRegistry");
const { aplicarAcao } = require("../src/services/duelEngine");

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

const itensCriados = [];

test.after(async () => {
  if (!temBanco) return;
  if (itensCriados.length > 0) {
    await ConsumableEffect.destroy({ where: { id_item: itensCriados } });
    await ConsumableProperties.destroy({ where: { id_item: itensCriados } });
    await Item.destroy({ where: { id: itensCriados } });
  }
  await sequelize.close();
});

async function criarItemConsumivel({ nome = "Item de Teste", efeito_vida = 0, efeito_mana = 0 } = {}) {
  const item = await Item.create({
    nome: `${nome} ${sufixo()}`,
    descricao: "Item de teste de cura/mana.",
    tipo_item: "Consumivel",
    raridade: "Comum",
  });
  itensCriados.push(item.id);
  await ConsumableProperties.create({ id_item: item.id, efeito_vida, efeito_mana });
  return item;
}

async function adicionarEfeitoModerno(idItem, effectKey, magnitude) {
  return ConsumableEffect.create({ id_item: idItem, effect_key: effectKey, magnitude, ativo: true });
}

async function darItem(personagemId, idItem, quantidade = 1) {
  return CharacterInventory.create({ id_personagem: personagemId, id_item: idItem, quantidade });
}

// ---------------------------------------------------------------------
// Handlers isolados (puro, sem banco)
// ---------------------------------------------------------------------

test("HEAL_HP_FLAT soma pontos fixos e clampa no máximo", () => {
  const r1 = executarEfeito("HEAL_HP_FLAT", { magnitude: 15, vidaAtual: 50, vidaMaxima: 100 });
  assert.equal(r1.vidaAtual, 65);
  assert.equal(r1.curou, 15);

  const r2 = executarEfeito("HEAL_HP_FLAT", { magnitude: 15, vidaAtual: 95, vidaMaxima: 100 });
  assert.equal(r2.vidaAtual, 100, "nunca passa do máximo");
  assert.equal(r2.curou, 5);
});

test("HEAL_HP_PERCENT cura percentual do máximo, não da vida atual", () => {
  const r = executarEfeito("HEAL_HP_PERCENT", { magnitude: 50, vidaAtual: 10, vidaMaxima: 100 });
  assert.equal(r.curou, 50);
  assert.equal(r.vidaAtual, 60);
});

test("RESTORE_MANA_FLAT e RESTORE_MANA_PERCENT espelham os handlers de vida", () => {
  const flat = executarEfeito("RESTORE_MANA_FLAT", { magnitude: 20, manaAtual: 10, manaMaxima: 50 });
  assert.equal(flat.manaAtual, 30);
  assert.equal(flat.curou, 20);

  const percent = executarEfeito("RESTORE_MANA_PERCENT", { magnitude: 40, manaAtual: 0, manaMaxima: 50 });
  assert.equal(percent.curou, 20);
  assert.equal(percent.manaAtual, 20);
});

test("quantidade escala a cura (uso fora de combate com múltiplas unidades)", () => {
  const r = executarEfeito("HEAL_HP_PERCENT", { magnitude: 10, vidaAtual: 0, vidaMaxima: 100, quantidade: 3 });
  assert.equal(r.curou, 30);
});

// ---------------------------------------------------------------------
// consumableEffectService.aplicarEfeitosDoItem
// ---------------------------------------------------------------------

testeComBanco("aplicarEfeitosDoItem: HEAL_HP_PERCENT sozinho seta temEfeitoDeVida sem mexer em mana", async () => {
  const item = await criarItemConsumivel({ nome: "Cura Teste" });
  await adicionarEfeitoModerno(item.id, "HEAL_HP_PERCENT", 50);

  const r = await consumableEffectService.aplicarEfeitosDoItem({
    idItem: item.id,
    statusEffects: [],
    vidaAtual: 10,
    vidaMaxima: 100,
    manaAtual: 20,
    manaMaxima: 50,
    nomeAlvo: "Você",
  });

  assert.equal(r.temEfeitoDeVida, true);
  assert.equal(r.temEfeitoDeMana, false);
  assert.equal(r.vidaAtual, 60);
  assert.equal(r.curaVida, 50);
  assert.equal(r.manaAtual, 20, "mana não deveria ter sido tocada");
});

testeComBanco("aplicarEfeitosDoItem: dois efeitos (vida + mana) no mesmo item somam cada um no seu recurso", async () => {
  const item = await criarItemConsumivel({ nome: "Elixir Teste" });
  await adicionarEfeitoModerno(item.id, "HEAL_HP_FLAT", 10);
  await adicionarEfeitoModerno(item.id, "RESTORE_MANA_FLAT", 5);

  const r = await consumableEffectService.aplicarEfeitosDoItem({
    idItem: item.id,
    statusEffects: [],
    vidaAtual: 0,
    vidaMaxima: 100,
    manaAtual: 0,
    manaMaxima: 100,
    nomeAlvo: "Você",
  });

  assert.equal(r.temEfeitoDeVida, true);
  assert.equal(r.temEfeitoDeMana, true);
  assert.equal(r.vidaAtual, 10);
  assert.equal(r.manaAtual, 5);
});

testeComBanco("aplicarEfeitosDoItem: effect_key fora da whitelist é ignorada com segurança", async () => {
  const item = await criarItemConsumivel({ nome: "Item Invalido" });
  await ConsumableEffect.create({ id_item: item.id, effect_key: "ISTO_NAO_EXISTE", magnitude: 999, ativo: true });

  const r = await consumableEffectService.aplicarEfeitosDoItem({
    idItem: item.id,
    statusEffects: [],
    vidaAtual: 10,
    vidaMaxima: 100,
    nomeAlvo: "Você",
  });

  assert.equal(r.temEfeitoDeVida, false);
  assert.equal(r.vidaAtual, 10, "nada deveria ter mudado");
});

// ---------------------------------------------------------------------
// combatController.js — ação de item em combate PvE solo
// ---------------------------------------------------------------------

async function chamarExecutarTurno(characterId, action) {
  let statusCode = null;
  let corpo = null;
  const req = { personagemAtual: { id: characterId }, body: { action } };
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
  await combatController.executarTurno(req, res);
  return { statusCode, corpo };
}

function statsPersonagemPadrao(personagem) {
  return {
    nivel: personagem.nivel,
    forca: personagem.forca,
    vitalidade: personagem.vitalidade,
    agilidade: personagem.agilidade,
    inteligencia: personagem.inteligencia,
    velocidade: personagem.velocidade,
    defesa: 0,
    arma_equipada: null,
    armaEquipadaEfeitos: [],
    multiplicador_vida_por_nivel: 1,
    multiplicador_mana_por_nivel: 1,
    multiplicador_dano_fisico: 1,
    multiplicador_dano_magico: 1,
  };
}

async function encontroDeTreino(personagem, { vida = 10, mana = 10 } = {}) {
  personagem.encontro_pve = {
    nome: "Boneco de Treino",
    nivel: 1,
    forca: 1,
    vitalidade: 1,
    agilidade: 0,
    velocidade: 1,
    vida_maxima: 1000,
    vida_atual: 1000,
    dano_base: 0,
    defesa: 0,
    criadoEm: Date.now(),
    statsPersonagem: statsPersonagemPadrao(personagem),
    statusEffects: { player: [], enemy: [] },
    cooldowns: { player: {}, enemy: {} },
    combatTurn: 0,
  };
  personagem.vida_atual = vida;
  personagem.mana_atual = mana;
  await personagem.save();
}

testeComBanco("combate PvE: item só com legado efeito_vida continua curando normalmente (regressão)", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const item = await criarItemConsumivel({ nome: "Poção Legada", efeito_vida: 20 });
  await darItem(personagem.id, item.id, 1);
  await encontroDeTreino(personagem, { vida: 10 });

  const r = await chamarExecutarTurno(personagem.id, { type: "item", itemId: item.id });
  assert.equal(r.statusCode, 200);
  assert.ok(r.corpo.data.character.vida_atual > 10, "deveria ter curado via legado");
  assert.ok(r.corpo.data.log.some((l) => l.includes("recuperou")));
});

testeComBanco("combate PvE: item com HEAL_HP_PERCENT moderno E efeito_vida legado só cura UMA vez (nunca soma os dois)", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  // efeito_vida legado de 90% ficaria óbvio se fosse somado também —
  // sobraria vida quase cheia em vez do valor exato do moderno (30%).
  const item = await criarItemConsumivel({ nome: "Poção Migrada", efeito_vida: 90 });
  await adicionarEfeitoModerno(item.id, "HEAL_HP_PERCENT", 30);
  await darItem(personagem.id, item.id, 1);
  await encontroDeTreino(personagem, { vida: 1 });

  const r = await chamarExecutarTurno(personagem.id, { type: "item", itemId: item.id });
  assert.equal(r.statusCode, 200);
  // vidaMaxima = 30 + vitalidade(10)*6 + bonusPorNivel(nivel 5, 5/nível) = 30+60+20 = 110
  // 30% de 110 arredondado = 33 — nunca 90%+30% somados. Checa pela mensagem de log
  // (gerada ANTES do contra-ataque do Boneco de Treino) em vez da vida_atual final,
  // que varia com o crítico aleatório do contra-ataque (Math.random() em rolarCritico)
  // e não tem nada a ver com o que este teste cobre.
  assert.ok(
    r.corpo.data.log.some((l) => l.includes("recuperou 33 de vida")),
    `log deveria mostrar a cura exata do efeito moderno (33), nunca a soma com o legado: ${JSON.stringify(r.corpo.data.log)}`,
  );
});

testeComBanco("combate PvE: item com RESTORE_MANA_FLAT moderno ignora efeito_mana legado", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const item = await criarItemConsumivel({ nome: "Mana Migrada", efeito_mana: 90 });
  await adicionarEfeitoModerno(item.id, "RESTORE_MANA_FLAT", 7);
  await darItem(personagem.id, item.id, 1);
  await encontroDeTreino(personagem, { mana: 0 });

  const r = await chamarExecutarTurno(personagem.id, { type: "item", itemId: item.id });
  assert.equal(r.statusCode, 200);
  assert.equal(r.corpo.data.character.mana_atual, 7);
});

// ---------------------------------------------------------------------
// characterInventoryController.useItem — fora de combate
// ---------------------------------------------------------------------

async function chamarUseItem(characterId, idItem, quantidade = 1) {
  let statusCode = null;
  let corpo = null;
  const req = { personagemAtual: { id: characterId }, body: { id_item: idItem, quantidade } };
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
  await characterInventoryController.useItem(req, res);
  return { statusCode, corpo };
}

testeComBanco("useItem (fora de combate): HEAL_HP_FLAT moderno escala por quantidade e ignora legado", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  personagem.vida_atual = 0;
  await personagem.save();
  const item = await criarItemConsumivel({ nome: "Cura Fora De Combate", efeito_vida: 90 });
  await adicionarEfeitoModerno(item.id, "HEAL_HP_FLAT", 5);
  await darItem(personagem.id, item.id, 3);

  const r = await chamarUseItem(personagem.id, item.id, 3);
  assert.equal(r.statusCode, 200);
  assert.equal(r.corpo.data.character.vida_atual, 15, "5 de cura x 3 unidades, nunca o legado de 90%");
});

testeComBanco("useItem (fora de combate): sem efeito moderno, legado efeito_mana continua funcionando (regressão)", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  personagem.mana_atual = 0;
  await personagem.save();
  const item = await criarItemConsumivel({ nome: "Mana Legada Fora De Combate", efeito_mana: 20 });
  await darItem(personagem.id, item.id, 1);

  const r = await chamarUseItem(personagem.id, item.id, 1);
  assert.equal(r.statusCode, 200);
  assert.ok(r.corpo.data.character.mana_atual > 0, "deveria ter curado via legado");
});

// ---------------------------------------------------------------------
// duelEngine.aplicarAcao — PvP/Grupo (síncrono, sem banco)
// ---------------------------------------------------------------------

test("duelEngine.aplicarAcao: efeito moderno de vida ignora efeito_vida legado do mesmo item", () => {
  const atacante = { vida_atual: 10, mana_atual: 10 };
  const defensor = { vida_atual: 100 };
  const resultado = aplicarAcao({
    atacante,
    defensor,
    acao: {
      tipo: "item",
      item: { nome: "Poção Migrada" },
      efeito: { efeito_vida: 90, efeito_mana: 0 },
      efeitosConsumiveisModernos: [{ effect_key: "HEAL_HP_PERCENT", magnitude: 30 }],
    },
    vidaMaxAtacante: 100,
    manaMaxAtacante: 100,
  });

  assert.equal(resultado.cura, 30, "deveria curar só o valor do moderno (30%), nunca somar o legado (90%)");
  assert.equal(atacante.vida_atual, 40);
});

test("duelEngine.aplicarAcao: sem efeitosConsumiveisModernos, cai no legado normalmente (regressão)", () => {
  const atacante = { vida_atual: 10, mana_atual: 10 };
  const defensor = { vida_atual: 100 };
  const resultado = aplicarAcao({
    atacante,
    defensor,
    acao: { tipo: "item", item: { nome: "Poção Legada" }, efeito: { efeito_vida: 50, efeito_mana: 0 } },
    vidaMaxAtacante: 100,
    manaMaxAtacante: 100,
  });

  assert.equal(resultado.cura, 50);
  assert.equal(atacante.vida_atual, 60);
});

test("duelEngine.aplicarAcao: efeito moderno de mana e vida juntos, cada um no seu recurso", () => {
  const atacante = { vida_atual: 0, mana_atual: 0 };
  const defensor = { vida_atual: 100 };
  const resultado = aplicarAcao({
    atacante,
    defensor,
    acao: {
      tipo: "item",
      item: { nome: "Elixir Migrado" },
      efeito: { efeito_vida: 0, efeito_mana: 0 },
      efeitosConsumiveisModernos: [
        { effect_key: "HEAL_HP_FLAT", magnitude: 10 },
        { effect_key: "RESTORE_MANA_FLAT", magnitude: 5 },
      ],
    },
    vidaMaxAtacante: 100,
    manaMaxAtacante: 100,
  });

  assert.equal(resultado.cura, 10);
  assert.equal(resultado.manaCurada, 5);
  assert.equal(atacante.vida_atual, 10);
  assert.equal(atacante.mana_atual, 5);
});
