const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Grant de receitas DESCOBERTA (spec §9) — idempotente por
// (id_personagem, id_recipe), fonte auditável em source_key.
const CharacterAlchemyRecipeUnlock = sequelize.define(
  "CharacterAlchemyRecipeUnlock",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    id_recipe: { type: DataTypes.INTEGER, allowNull: false },
    source_key: { type: DataTypes.STRING(80), allowNull: true },
    desbloqueada_em: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { tableName: "character_alchemy_recipe_unlocks", timestamps: false },
);

module.exports = CharacterAlchemyRecipeUnlock;
