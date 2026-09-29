const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Desbloqueio PERMANENTE de Receita por personagem (spec §4.3/§9.2) —
// mesmo padrão de CharacterAlchemyRecipeUnlock. Unique
// (id_personagem, id_blueprint) impede aprender duas vezes o mesmo
// Blueprint (nunca consumir uma segunda cópia da Receita já conhecida).
const CharacterForgeRecipeUnlock = sequelize.define(
  "CharacterForgeRecipeUnlock",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    id_blueprint: { type: DataTypes.INTEGER, allowNull: false },
    source_type: {
      type: DataTypes.ENUM("EXPLORATION", "BOSS", "MARKET", "MISSION", "EVENT", "ADMIN", "OTHER"),
      allowNull: false,
      defaultValue: "OTHER",
    },
    source_id: { type: DataTypes.INTEGER, allowNull: true },
    learned_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { tableName: "character_forge_recipe_unlocks", timestamps: false },
);

module.exports = CharacterForgeRecipeUnlock;
