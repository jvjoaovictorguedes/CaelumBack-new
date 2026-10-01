"use strict";

// Loja do Aventureiro V2 (doc "loja_aventureiro_v2_caelum_final") §4.1
// — PlayerShop é só o PERFIL comercial do personagem (nome, descrição,
// se aceita encomendas, visibilidade). Produtos continuam sendo
// MarketListing de verdade (nunca uma tabela paralela — §5/§17);
// demandas e encomendas ganham tabelas próprias nas fases seguintes.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("player_shops", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_personagem: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: "Characters", key: "id" },
        onDelete: "CASCADE",
      },
      nome: { type: Sequelize.STRING(100), allowNull: false },
      descricao: { type: Sequelize.TEXT, allowNull: true },
      aceita_encomendas: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      ativa: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    // Busca por nome da loja (§12: "Busca por nome da loja/personagem")
    // e listagem pública só de lojas ativas.
    await queryInterface.addIndex("player_shops", ["nome"], { name: "player_shops_nome_idx" });
    await queryInterface.addIndex("player_shops", ["ativa"], { name: "player_shops_ativa_idx" });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("player_shops");
  },
};
