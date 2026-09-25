const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Posse de embarcação (spec §18.2).
const CharacterVessel = sequelize.define(
  "CharacterVessel",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    id_vessel: { type: DataTypes.INTEGER, allowNull: false },
    selecionada: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    adquirida_em: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    tableName: "character_vessels",
    indexes: [{ unique: true, fields: ["id_personagem", "id_vessel"] }],
  },
);

module.exports = CharacterVessel;
