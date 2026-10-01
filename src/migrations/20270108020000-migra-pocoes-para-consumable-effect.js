"use strict";

// Alquimia/Caldeirão V2 (spec §6.5) — migra Poção de Vida/Mana (e os
// demais consumíveis de cura/mana pré-existentes) pro motor moderno de
// ConsumableEffect. Idempotente por nome de Item: só mexe em item que
// JÁ existe (scripts/reseed-itens-producao.js é quem cria esse catálogo
// em produção — num banco onde esses itens nunca foram semeados, como o
// de testes, esta migration simplesmente não encontra nada e não faz
// nada).
//
// O legado ConsumableProperties.efeito_vida/efeito_mana é MANTIDO tal
// qual está — consumableEffectService.aplicarEfeitosDoItem passa a
// ignorá-lo sozinho assim que o item ganha o ConsumableEffect
// equivalente (nunca os dois juntos, ver combatController.js/
// characterInventoryController.js/duelEngine.js), então apagá-lo aqui
// não é necessário nem desejável (serve de histórico/fallback caso o
// efeito moderno seja desativado manualmente no futuro).
//
// magnitude espelha EXATAMENTE o efeito_vida/efeito_mana atual de cada
// item (ver scripts/reseed-itens-producao.js) — migrar pro motor novo
// não muda nada numericamente pro jogador.
const ITENS_DE_VIDA = {
  "Poção de Vida Pequena": 20,
  "Poção de Vida Média": 45,
  "Poção de Vida Grande": 80,
  "Bandagem Improvisada": 10,
  "Poção da Fênix": 100,
};

const ITENS_DE_MANA = {
  "Poção de Mana Pequena": 20,
  "Poção de Mana Média": 45,
  "Poção de Mana Grande": 80,
};

// Cura vida E mana — precisa dos dois effect_keys na mesma linha.
const ITENS_DE_VIDA_E_MANA = {
  "Tônico Revigorante": { vida: 30, mana: 30 },
  "Elixir do Aventureiro": { vida: 50, mana: 50 },
};

const TODOS_OS_NOMES = [
  ...Object.keys(ITENS_DE_VIDA),
  ...Object.keys(ITENS_DE_MANA),
  ...Object.keys(ITENS_DE_VIDA_E_MANA),
];

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;

    async function idItemPorNome(nome) {
      const [rows] = await sequelize.query(`SELECT id FROM "Items" WHERE nome = :nome LIMIT 1;`, {
        replacements: { nome },
      });
      return rows.length > 0 ? rows[0].id : null;
    }

    async function garantirConsumableEffect(idItem, effectKey, magnitude) {
      const [existente] = await sequelize.query(
        `SELECT id FROM consumable_effects WHERE id_item = :idItem AND effect_key = :effectKey LIMIT 1;`,
        { replacements: { idItem, effectKey } },
      );
      if (existente.length > 0) return;
      await sequelize.query(
        `INSERT INTO consumable_effects (id_item, effect_key, magnitude, duration_turns, config, ativo, "createdAt", "updatedAt")
         VALUES (:idItem, :effectKey, :magnitude, NULL, NULL, true, now(), now());`,
        { replacements: { idItem, effectKey, magnitude } },
      );
    }

    for (const [nome, pct] of Object.entries(ITENS_DE_VIDA)) {
      const idItem = await idItemPorNome(nome);
      if (idItem) await garantirConsumableEffect(idItem, "HEAL_HP_PERCENT", pct);
    }

    for (const [nome, pct] of Object.entries(ITENS_DE_MANA)) {
      const idItem = await idItemPorNome(nome);
      if (idItem) await garantirConsumableEffect(idItem, "RESTORE_MANA_PERCENT", pct);
    }

    for (const [nome, { vida, mana }] of Object.entries(ITENS_DE_VIDA_E_MANA)) {
      const idItem = await idItemPorNome(nome);
      if (!idItem) continue;
      await garantirConsumableEffect(idItem, "HEAL_HP_PERCENT", vida);
      await garantirConsumableEffect(idItem, "RESTORE_MANA_PERCENT", mana);
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    await sequelize.query(
      `DELETE FROM consumable_effects
       WHERE effect_key IN ('HEAL_HP_PERCENT', 'RESTORE_MANA_PERCENT')
       AND id_item IN (SELECT id FROM "Items" WHERE nome IN (:nomes));`,
      { replacements: { nomes: TODOS_OS_NOMES } },
    );
  },
};
