const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Recompensas de um contrato de Rank (§33) — N linhas por missão em vez
// de colunas fixas em AdventureGuildMission (evita repetir o problema
// que o Mission antigo tinha de só suportar 1 item de recompensa).
const AdventureGuildMissionReward = sequelize.define(
  "AdventureGuildMissionReward",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_mission: { type: DataTypes.INTEGER, allowNull: false },
    tipo: { type: DataTypes.ENUM("Ouro", "XP", "Item"), allowNull: false },
    id_item: { type: DataTypes.INTEGER, allowNull: true },
    quantidade: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    tableName: "adventure_guild_mission_rewards",
  },
);

module.exports = AdventureGuildMissionReward;
