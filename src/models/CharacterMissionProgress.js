const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const CharacterMissionProgress = sequelize.define(
  "CharacterMissionProgress",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    id_mission: { type: DataTypes.INTEGER, allowNull: false },
    progresso: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    concluida: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    recompensa_resgatada: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    expira_em: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "character_mission_progress" },
);

module.exports = CharacterMissionProgress;
