const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Templo do Véu Celestial — contadores de pity do Relicário (§7.1).
// GLOBAL por personagem (sem id_event de propósito): o pity principal
// persiste ENTRE Convergências por recomendação explícita da spec.
const CharacterTempleDrawState = sequelize.define(
  "CharacterTempleDrawState",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    character_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    draws_desde_raro_mais: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    draws_desde_featured: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    total_draws: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    last_draw_at: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "character_temple_draw_state" },
);

module.exports = CharacterTempleDrawState;
