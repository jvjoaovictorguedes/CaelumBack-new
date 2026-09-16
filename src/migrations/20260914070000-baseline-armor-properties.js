"use strict";

const { QueryTypes } = require("sequelize");

// O nome da tabela não tem "tableName" explícito no model, então depende da
// pluralização automática do Sequelize (imprevisível pra um nome que já
// termina em "ies", como vimos com CharacterAbilities/RaceAbilities). Em vez
// de arriscar criar uma tabela duplicada com nome errado, localizamos a
// tabela real pela coluna "slot_equipamento", que só existe nela.
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
    const existing = await findExistingTable(queryInterface, "slot_equipamento");
    if (existing) {
      console.log(`[migration] Tabela de ArmorProperties já existe como "${existing}" — pulando criação.`);
      return;
    }

    // Só chega aqui num banco realmente novo, sem a tabela ainda.
    await queryInterface.createTable("ArmorProperties", {
      id_item: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        allowNull: false,
        references: { model: "Items", key: "id" },
      },
      slot_equipamento: {
        type: Sequelize.ENUM("Cabeca", "Torso", "Maos", "Pes"),
        allowNull: false,
      },
      defesa: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      bonus_forca: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      bonus_vitalidade: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      bonus_inteligencia: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      bonus_agilidade: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      bonus_velocidade: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
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
