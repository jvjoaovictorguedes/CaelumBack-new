const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Progressão de Alquimia — independente da Forja (spec §8), mesmo
// padrão de CharacterForgeProgress (id_personagem + nivel + experiencia).
const CharacterAlchemyProgress = sequelize.define(
  "CharacterAlchemyProgress",
  {
    id_personagem: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    nivel: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    experiencia: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    total_produzido: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: "character_alchemy_progress", timestamps: false },
);

module.exports = CharacterAlchemyProgress;
