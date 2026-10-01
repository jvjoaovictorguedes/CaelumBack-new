"use strict";

// Alquimia/Caldeirão V2 (spec §8.1) — metadados opcionais da fórmula
// física sobre a própria AlchemyRecipe, em vez de um domínio paralelo
// tipo "AlchemyFormula". Só fazem sentido quando modo_desbloqueio =
// DESCOBERTA (validado em serviço, não aqui — migration só cria coluna).
//
// id_item_receita aponta pro Item físico (tipo_item = "Receita", já
// suportado pelo catálogo desde a fundação) que o jogador encontra/
// recebe e usa pra "aprender" a receita (ver alchemyLearnService.js).
// UNIQUE evita duas AlchemyRecipe reivindicarem o mesmo pergaminho.
module.exports = {
  async up(queryInterface, Sequelize) {
    const colunas = await queryInterface.describeTable("alchemy_recipes");

    if (!colunas.id_item_receita) {
      await queryInterface.addColumn("alchemy_recipes", "id_item_receita", {
        type: Sequelize.INTEGER,
        allowNull: true,
        unique: true,
        references: { model: "Items", key: "id" },
        onDelete: "RESTRICT",
      });
    }
    if (!colunas.raridade_receita) {
      await queryInterface.addColumn("alchemy_recipes", "raridade_receita", {
        type: Sequelize.ENUM("Comum", "Raro", "Lendario"),
        allowNull: true,
      });
    }
    if (!colunas.negociavel_receita) {
      await queryInterface.addColumn("alchemy_recipes", "negociavel_receita", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
    if (!colunas.consome_ao_aprender) {
      await queryInterface.addColumn("alchemy_recipes", "consome_ao_aprender", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }
    if (!colunas.pista_publica) {
      await queryInterface.addColumn("alchemy_recipes", "pista_publica", {
        type: Sequelize.STRING(240),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const colunas = await queryInterface.describeTable("alchemy_recipes");
    for (const nome of ["pista_publica", "consome_ao_aprender", "negociavel_receita", "raridade_receita", "id_item_receita"]) {
      if (colunas[nome]) await queryInterface.removeColumn("alchemy_recipes", nome);
    }
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_alchemy_recipes_raridade_receita";`).catch(() => {});
  },
};
