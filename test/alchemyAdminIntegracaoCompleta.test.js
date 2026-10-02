// Alquimia/Caldeirão V2 — integração ponta a ponta: o admin CONFIGURA os
// efeitos pelo mesmo service que o painel usa (adminAlchemyService, nunca
// Model.create direto como os outros testes de motor fazem) e o jogador
// USA o item de verdade em combate PvE real (combatController), cobrindo
// 3 lacunas que nenhum teste existente fechava sozinho:
//   1. Um item com VÁRIOS effect_key diferentes ao mesmo tempo
//      (cura + buff de dano + escudo), criado via admin, chegando intacto
//      no motor de combate.
//   2. Empilhamento de DANO_SAIDA_PCT vindo de DOIS ITENS DIFERENTES
//      (cada um criado/admistrado separadamente) ao longo de turnos reais
//      — só havia cobertura de "um item só" ou da soma pura em
//      combatBuffService, nunca os dois itens passando pelo
//      combatController de verdade.
//   3. Auditoria completa (spec Caldeirão §12/Painel Administrativo §44):
//      create/update/delete de ConsumableEffect pelo admin realmente
//      grava AdminActionLog com dados_antes/dados_depois corretos — os
//      testes de CRUD (adminAlchemyEffects.test.js) nunca checavam isso.
const test = require("node:test");
const assert = require("node:assert/strict");

// test/helpers/db SEMPRE primeiro — combatController/duelEngine carregam
// um model do Sequelize por baixo dos panos (ver comentário em
// combatBuff.test.js).
const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const ConsumableProperties = require("../src/models/ConsumableProperties");
const ConsumableEffect = require("../src/models/ConsumableEffect");
const CharacterInventory = require("../src/models/CharacterInventory");
const AdminActionLog = require("../src/models/AdminActionLog");
const adminAlchemyService = require("../src/services/adminAlchemyService");
const combatController = require("../src/controllers/combatController");

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

async function criarItemConsumivel(nome) {
  const item = await Item.create({
    nome: `${nome} ${sufixo()}`,
    descricao: "Item de teste de integração admin->combate.",
    tipo_item: "Consumivel",
    raridade: "Comum",
  });
  itensCriados.push(item.id);
  await ConsumableProperties.create({ id_item: item.id, efeito_vida: 0, efeito_mana: 0 });
  return item;
}

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

async function encontroDeTreino(personagem, overrides = {}) {
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
    combatBuffs: { player: [], enemy: [] },
    escudo: { player: null, enemy: null },
    cooldowns: { player: {}, enemy: {} },
    combatTurn: 0,
    ...overrides,
  };
  // vidaMaxima real pra nivel 5/vitalidade 10 é 110 — nunca um valor acima
  // disso, senão sincronizarRegeneracaoDeVidaEMana clampa antes do combate
  // (mesma pegadinha documentada em combatEvolucaoStatusIntegracao.test.js).
  personagem.vida_atual = 40;
  personagem.mana_atual = 86;
  await personagem.save();
}

testeComBanco(
  "admin configura um item com cura+buff+escudo juntos, e o jogador usa de verdade em combate PvE",
  async () => {
    const itemMultiEfeito = await criarItemConsumivel("Elixir do Guardião Completo");

    const efeitoCura = await adminAlchemyService.createAdminConsumableEffect(
      itemMultiEfeito.id,
      { effect_key: "HEAL_HP_FLAT", magnitude: 15 },
      { idAdmin: 1, req: {} },
    );
    const efeitoBuff = await adminAlchemyService.createAdminConsumableEffect(
      itemMultiEfeito.id,
      { effect_key: "APPLY_COMBAT_BUFF", magnitude: 20, duration_turns: 3, config: { atributo: "DANO_SAIDA_PCT" } },
      { idAdmin: 1, req: {} },
    );
    const efeitoEscudo = await adminAlchemyService.createAdminConsumableEffect(
      itemMultiEfeito.id,
      { effect_key: "GRANT_SHIELD", magnitude: 50, duration_turns: 2 },
      { idAdmin: 1, req: {} },
    );

    // Auditoria (spec Painel Administrativo §44) — cada criação precisa
    // ter gravado seu próprio AdminActionLog, com dados_depois batendo
    // com o que foi persistido de verdade.
    for (const efeito of [efeitoCura, efeitoBuff, efeitoEscudo]) {
      const log = await AdminActionLog.findOne({
        where: { entidade: "ConsumableEffect", id_entidade: efeito.id, acao: "criar" },
        order: [["id", "DESC"]],
      });
      assert.ok(log, `deveria existir log de auditoria pra criar o efeito ${efeito.id}`);
      assert.equal(log.dados_depois.effect_key, efeito.effect_key);
      assert.equal(log.dados_antes, null);
    }

    // Update: editar a magnitude da cura — audita dados_antes E dados_depois.
    const curaEditada = await adminAlchemyService.updateAdminConsumableEffect(
      efeitoCura.id,
      { magnitude: 25 },
      { idAdmin: 1, req: {} },
    );
    const logEdicao = await AdminActionLog.findOne({
      where: { entidade: "ConsumableEffect", id_entidade: efeitoCura.id, acao: "editar" },
      order: [["id", "DESC"]],
    });
    assert.ok(logEdicao, "deveria existir log de auditoria pra editar o efeito");
    assert.equal(logEdicao.dados_antes.magnitude, 15);
    assert.equal(logEdicao.dados_depois.magnitude, 25);
    assert.equal(curaEditada.magnitude, 25);

    // O item precisa chegar no combate com os 3 efeitos intactos, nunca
    // só o último criado (regressão de "sobrescrever em vez de acumular").
    const { personagem } = await criarPersonagem({ nivel: 5 });
    await CharacterInventory.create({ id_personagem: personagem.id, id_item: itemMultiEfeito.id, quantidade: 1 });
    // dano_min/dano_max fixos pra conferir a absorção do escudo com número exato.
    await encontroDeTreino(personagem, { dano_min: 40, dano_max: 40 });

    const original = Math.random;
    Math.random = () => 0.99; // garante acerto sem crítico (teto real é 35%/40%)
    try {
      const vidaAntes = personagem.vida_atual;
      const turno1 = await chamarExecutarTurno(personagem.id, { type: "item", itemId: itemMultiEfeito.id });
      assert.equal(turno1.statusCode, 200);

      // HEAL_HP_FLAT (editado pra 25) curou de verdade — valor logo após a
      // AÇÃO do jogador, ainda antes do contra-ataque do inimigo resolver.
      assert.equal(turno1.corpo.data.character.vida_apos_sua_acao, vidaAntes + 25);

      // APPLY_COMBAT_BUFF (DANO_SAIDA_PCT 20%) está na lista de buffs do jogador.
      assert.equal(turno1.corpo.data.combatBuffs.player.length, 1);
      assert.equal(turno1.corpo.data.combatBuffs.player[0].remainingTurns, 2, "decrementa no mesmo turno em que foi aplicado (3 -> 2)");

      // GRANT_SHIELD absorveu o contra-ataque de 40 por completo (escudo de
      // 50) — vida_atual FINAL (pós-contra-ataque) continua igual à de
      // logo após a cura, nunca cai mais.
      assert.equal(turno1.corpo.data.danoRecebidoContraAtaque, 40, "dano bruto reportado continua o mesmo, antes da absorção");
      assert.equal(turno1.corpo.data.character.vida_atual, vidaAntes + 25, "escudo absorveu o contra-ataque inteiro — vida final não cai além da cura");
    } finally {
      Math.random = original;
    }
  },
);

testeComBanco(
  "DANO_SAIDA_PCT de DOIS itens diferentes (cada um administrado separadamente) empilha em combate real, batendo com a fórmula do buff único",
  async () => {
    const itemFuria1 = await criarItemConsumivel("Elixir de Fúria Menor");
    await adminAlchemyService.createAdminConsumableEffect(
      itemFuria1.id,
      { effect_key: "APPLY_COMBAT_BUFF", magnitude: 20, duration_turns: 3, config: { atributo: "DANO_SAIDA_PCT" } },
      { idAdmin: 1, req: {} },
    );
    const itemFuria2 = await criarItemConsumivel("Elixir de Fúria Maior");
    await adminAlchemyService.createAdminConsumableEffect(
      itemFuria2.id,
      { effect_key: "APPLY_COMBAT_BUFF", magnitude: 30, duration_turns: 3, config: { atributo: "DANO_SAIDA_PCT" } },
      { idAdmin: 1, req: {} },
    );

    const { personagem } = await criarPersonagem({ nivel: 5 });
    await CharacterInventory.create({ id_personagem: personagem.id, id_item: itemFuria1.id, quantidade: 1 });
    await CharacterInventory.create({ id_personagem: personagem.id, id_item: itemFuria2.id, quantidade: 1 });
    await encontroDeTreino(personagem);

    const original = Math.random;
    Math.random = () => 0.99;
    try {
      const turno1 = await chamarExecutarTurno(personagem.id, { type: "item", itemId: itemFuria1.id });
      assert.equal(turno1.statusCode, 200);
      assert.equal(turno1.corpo.data.combatBuffs.player.length, 1);

      const turno2 = await chamarExecutarTurno(personagem.id, { type: "item", itemId: itemFuria2.id });
      assert.equal(turno2.statusCode, 200);
      assert.equal(turno2.corpo.data.combatBuffs.player.length, 2, "os dois buffs de itens diferentes coexistem, nunca um sobrescreve o outro");

      // forca=10, nivel=5, Math.random=0.99 (sem crítico): dano_base = 18
      // (mesma fórmula/constantes de combatBuff.test.js). Com os dois
      // buffs somados (20% + 30% = 50%): round(18 * 1.5) = 27 — idêntico
      // ao caso de um único item com 50%, provando que o empilhamento
      // entre itens produz o MESMO resultado que o buff único já coberto.
      const turno3 = await chamarExecutarTurno(personagem.id, { type: "attack" });
      assert.equal(turno3.statusCode, 200);
      assert.equal(turno3.corpo.data.danoCausadoNoInimigo, 27, "18 de base x 1.5 (20% + 30% empilhados de dois itens)");
    } finally {
      Math.random = original;
    }
  },
);

testeComBanco("deleteAdminConsumableEffect audita dados_antes (nunca null) e remove o efeito de verdade", async () => {
  const item = await criarItemConsumivel("Elixir Descontinuado");
  const efeito = await adminAlchemyService.createAdminConsumableEffect(
    item.id,
    { effect_key: "RESTORE_MANA_PERCENT", magnitude: 40 },
    { idAdmin: 1, req: {} },
  );

  await adminAlchemyService.deleteAdminConsumableEffect(efeito.id, { idAdmin: 1, req: {} });

  const log = await AdminActionLog.findOne({
    where: { entidade: "ConsumableEffect", id_entidade: efeito.id, acao: "excluir" },
    order: [["id", "DESC"]],
  });
  assert.ok(log, "deveria existir log de auditoria pra excluir o efeito");
  assert.equal(log.dados_antes.effect_key, "RESTORE_MANA_PERCENT");
  assert.equal(log.dados_antes.magnitude, 40);
  assert.equal(log.dados_depois, null);

  const restante = await ConsumableEffect.findByPk(efeito.id);
  assert.equal(restante, null, "exclusão real (DELETE), nunca só ativo:false");
});
