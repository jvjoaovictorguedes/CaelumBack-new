"use strict";

const { QueryTypes } = require("sequelize");

// Mesma lógica do baseline de ArmorProperties: localiza a tabela real pela
// coluna "tipo_arma" em vez de assumir o nome pluralizado.
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
    const existing = await findExistingTable(queryInterface, "tipo_arma");
    if (existing) {
      console.log(`[migration] Tabela de WeaponProperties já existe como "${existing}" — pulando criação.`);
      return;
    }

    await queryInterface.createTable("WeaponProperties", {
      id_item: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        allowNull: false,
        references: { model: "Items", key: "id" },
      },
      dano_min: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      dano_max: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      tipo_dano: {
        type: Sequelize.ENUM("Fisico", "Magico"),
        allowNull: false,
      },
      tipo_arma: {
        type: Sequelize.ENUM(
          "Espada",
          "Machado",
          "Cajado",
          "Adaga",
          "Lança",
          "Orbe",
        ),
        allowNull: false,
      },
      bonus_atributo: {
        type: Sequelize.ENUM(
          "Forca",
          "Vitalidade",
          "Inteligencia",
          "Agilidade",
          "Velocidade",
        ),
        allowNull: false,
      },
      valor_bonus_atributo: {
        type: Sequelize.FLOAT,
        defaultValue: 0.0,
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
