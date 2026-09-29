"use strict";

// Profissão de Ferreiro §7/§9 — contadores de carreira do Ferreiro
// (CharacterForgeStats), uma linha por personagem, criada sob demanda
// (findOrCreate) no primeiro evento real.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();
    if (tabelas.includes("character_forge_stats")) return;

    await queryInterface.createTable("character_forge_stats", {
      id_personagem: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false },
      barras_fundidas: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      equipamentos_fabricados: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      refinamentos_sucesso: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      refinamentos_falha: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      maior_refinamento_alcancado: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      qualidades_fabricadas: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      receitas_aprendidas_comum: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      receitas_aprendidas_raro: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      receitas_aprendidas_lendario: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("now()") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("now()") },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("character_forge_stats").catch(() => {});
  },
};
