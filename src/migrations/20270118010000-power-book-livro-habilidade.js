"use strict";

// Habilidades V2.0 §13 — Livros de Habilidade: aquisição rara de Powers
// via Item, sem criar uma segunda tabela de "habilidades aprendidas"
// (continua terminando em CharacterAbilities, via powerLearningService).
// `enum_Items_tipo_item` ganha um valor novo, aditivo (ADD VALUE),
// mesmo padrão já usado pra "Espolio" — nunca recriado do zero.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_Items_tipo_item" ADD VALUE IF NOT EXISTS 'LivroHabilidade';
    `);

    await queryInterface.createTable("power_books", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      id_item: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: "Items", key: "id" },
        onDelete: "CASCADE",
      },
      id_power: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Powers", key: "id" },
        onDelete: "CASCADE",
      },
      // Requisitos (§13, tabela) — todos opcionais; null = sem exigência
      // naquele campo. Validados em conjunto (E lógico) por
      // powerLearningService.validarRequisitosDoLivro.
      nivel_minimo: { type: Sequelize.INTEGER, allowNull: true },
      id_classe: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "Classes", key: "id" },
        onDelete: "SET NULL",
      },
      id_raca: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "Races", key: "id" },
        onDelete: "SET NULL",
      },
      natureza_magica: {
        type: Sequelize.ENUM("Fogo", "Agua", "Terra", "Ar", "Luz", "Escuridao", "Raio", "Yin&Yang"),
        allowNull: true,
      },
      id_power_prerequisito: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "Powers", key: "id" },
        onDelete: "SET NULL",
      },
      nivel_power_prerequisito: { type: Sequelize.INTEGER, allowNull: true },
      ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("power_books");
    // Postgres não suporta remover valor de ENUM sem recriar o tipo —
    // mesma decisão já documentada em 20260930670000-item-tipo-espolio.js.
  },
};
