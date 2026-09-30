"use strict";

// Vínculo Habilidade <-> Natureza Mágica — mesmo padrão de ClassAbilities/
// RaceAbilities (nivel_aprendizagem + custo_ouro opcional), só que a chave
// não é um id de catálogo (Natureza Mágica não tem tabela própria, é o
// mesmo ENUM já usado em Characters.natureza_magica e Evolutions.natureza_magica).
// Painel Admin de Habilidades §102.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("nature_abilities", {
      natureza_magica: {
        type: Sequelize.ENUM(
          "Fogo",
          "Agua",
          "Terra",
          "Ar",
          "Luz",
          "Escuridao",
          "Raio",
          "Yin&Yang",
        ),
        primaryKey: true,
        allowNull: false,
      },
      id_poder: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        allowNull: false,
        references: { model: "Powers", key: "id" },
        onDelete: "CASCADE",
      },
      nivel_aprendizagem: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        allowNull: false,
      },
      // NULL = libera de graça ao bater o nível (mesmo comportamento de
      // ClassAbilities/RaceAbilities) — com valor, precisa comprar na aba
      // Habilidades (comprarPoder em characterController.js).
      custo_ouro: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("nature_abilities");
  },
};
