"use strict";

// Pedido direto do time de conteúdo (01/10) — a cena de batalha nova da
// Ameaça Mundial (WorldBossBattleScene.tsx) usava a MESMA imagem_url
// (retrato do Boss) borrada como fundo, por falta de um campo próprio
// pra eles cadastrarem um fundo de batalha dedicado. fundo_url segue
// exatamente o mesmo padrão de imagem_url (STRING opcional, nunca
// obrigatório — Boss sem fundo cadastrado cai no fallback da imagem
// borrada, sem quebrar nenhum catálogo já existente).
module.exports = {
  async up(queryInterface, Sequelize) {
    const colunas = await queryInterface.describeTable("world_boss_configs");
    if (!colunas.fundo_url) {
      await queryInterface.addColumn("world_boss_configs", "fundo_url", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const colunas = await queryInterface.describeTable("world_boss_configs");
    if (colunas.fundo_url) {
      await queryInterface.removeColumn("world_boss_configs", "fundo_url");
    }
  },
};
