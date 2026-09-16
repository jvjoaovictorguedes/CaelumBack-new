"use strict";

const { QueryTypes } = require("sequelize");

// Mesma lógica de nome ambíguo do baseline de ArmorProperties: localiza a
// tabela real pela coluna "level_learned", exclusiva de CharacterAbilities.
// Como o model já usa "id_personagem" (renomeado antes), um banco novo já
// nasce com o nome certo, e a migration de rename (20260916120000) vira
// no-op nele.
async function findExistingTable(queryInterface, markerColumn) {
  const rows = await queryInterface.sequelize.query(
    `SELECT table_name FROM information_schema.columns
     WHERE column_name = :markerColumn AND table_schema = current_schema()`,
    { replacements: { markerColumn }, type: QueryTypes.SELECT },
  );
  return rows.length === 1 ? rows[0].table_name : null;
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const existing = await findExistingTable(queryInterface, "level_learned");
    if (existing) {
      console.log(`[migration] Tabela de CharacterAbilities já existe como "${existing}" — pulando criação.`);
      return;
    }

    await queryInterface.createTable("CharacterAbilities", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      id_personagem: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Characters", key: "id" },
      },
      id_power: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Powers", key: "id" },
      },
      level_learned: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        allowNull: false,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });
  },

  async down() {
    console.log(
      "[migration] down() de baseline é intencionalmente um no-op (não dropa a tabela em produção).",
    );
  },
};
