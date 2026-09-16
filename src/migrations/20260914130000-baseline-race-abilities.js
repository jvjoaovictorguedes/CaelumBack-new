"use strict";

const { QueryTypes } = require("sequelize");

// Mesma lógica de nome ambíguo do baseline de CharacterAbilities: localiza
// a tabela real pela coluna "nivel_aprendizado". O model já usa "id_raca"
// (renomeado antes), então um banco novo já nasce certo e a migration de
// rename (20260916130000) vira no-op nele.
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
    const existing = await findExistingTable(queryInterface, "nivel_aprendizado");
    if (existing) {
      console.log(`[migration] Tabela de RaceAbilities já existe como "${existing}" — pulando criação.`);
      return;
    }

    await queryInterface.createTable("RaceAbilities", {
      id_raca: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        allowNull: false,
        references: { model: "Races", key: "id" },
      },
      id_power: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        allowNull: false,
        references: { model: "Powers", key: "id" },
      },
      nivel_aprendizado: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
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
