const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Templo do Véu Celestial — estado do Guardião pessoal de UM
// personagem em UM evento (§4.4/§8.1). boss_unlocked_at só é
// registrado uma vez, quando todas as PROVACAO_PRINCIPAL daquele
// evento são concluídas; boss_cleared_at/reward_granted_at marcam a
// primeira vitória (§8.1 "uma vitória recompensada" — nunca paga duas
// vezes, ver unique constraint em TempleBossRewardGrant).
const CharacterTempleProgress = sequelize.define(
  "CharacterTempleProgress",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_event: { type: DataTypes.INTEGER, allowNull: false },
    character_id: { type: DataTypes.INTEGER, allowNull: false },
    boss_unlocked_at: { type: DataTypes.DATE, allowNull: true },
    boss_cleared_at: { type: DataTypes.DATE, allowNull: true },
    reward_granted_at: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "character_temple_progress" },
);

module.exports = CharacterTempleProgress;
