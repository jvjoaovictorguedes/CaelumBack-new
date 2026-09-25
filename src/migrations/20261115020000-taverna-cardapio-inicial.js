"use strict";

// Sistema de Taverna §5.1 — catálogo inicial sugerido (conteúdo de
// teste/seed, 100% editável depois pelo Painel Admin — nunca regra
// fixa). Idempotente por nome (Item.nome é unique).
module.exports = {
  async up(queryInterface) {
    const ITENS = [
      ["Ensopado do Viajante", "Um ensopado encorpado que fortalece o corpo por um tempo.", "Refeicao", "MAX_HP_PCT", 5, 1],
      ["Sopa do Guardião", "Sopa quente que endurece a pele como se fosse armadura.", "Refeicao", "PVE_DEFENSE_PCT", 5, 2],
      ["Carne do Caçador", "Carne assada que aguça os reflexos de combate.", "Refeicao", "PVE_DAMAGE_PCT", 4, 3],
      ["Banquete do Aventureiro", "Um banquete completo pra quem vai enfrentar a Aventura.", "Refeicao", "ADVENTURE_XP_PCT", 5, 4],
      ["Chá Arcano", "Infusão que expande a reserva de mana por um tempo.", "Bebida", "MAX_MANA_PCT", 5, 1],
      ["Infusão do Explorador", "Bebida que aguça o instinto de quem sai em expedição.", "Bebida", "EXPEDITION_XP_PCT", 5, 2],
      ["Café do Ferreiro", "Mantém o forjador desperto e mais produtivo na Forja.", "Bebida", "FORGE_XP_PCT", 5, 3],
      ["Tônico do Pescador", "Acalma a mão de quem está de vara na água.", "Bebida", "FISHING_CONTROL_PCT", 5, 4],
    ];

    for (const [nome, descricao, categoria, buffKey, magnitude, ordem] of ITENS) {
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM tavern_menu_items WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome } },
      );
      if (existente.length > 0) continue;

      await queryInterface.sequelize.query(
        `INSERT INTO tavern_menu_items
           (nome, descricao, categoria, preco_gold, buff_key, magnitude, duracao_segundos, ordem, ativo, "createdAt", "updatedAt")
         VALUES (:nome, :descricao, :categoria, 40, :buffKey, :magnitude, 3600, :ordem, true, now(), now());`,
        { replacements: { nome, descricao, categoria, buffKey, magnitude, ordem } },
      );
    }
  },

  async down(queryInterface) {
    const NOMES = [
      "Ensopado do Viajante",
      "Sopa do Guardião",
      "Carne do Caçador",
      "Banquete do Aventureiro",
      "Chá Arcano",
      "Infusão do Explorador",
      "Café do Ferreiro",
      "Tônico do Pescador",
    ];
    await queryInterface.sequelize.query(`DELETE FROM tavern_menu_items WHERE nome IN (:nomes);`, {
      replacements: { nomes: NOMES },
    });
  },
};
