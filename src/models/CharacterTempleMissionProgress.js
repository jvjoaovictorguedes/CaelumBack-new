const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Templo do Véu Celestial — progresso de UM personagem em UMA
// Provação (§4.3, event-driven: só templeObjectiveService escreve
// aqui, sempre na mesma transaction do evento real do servidor que
// gerou o progresso). cycle_key separa o ciclo diário do Rito
// (reseta) da instância única da Provação Principal (nunca reseta).
const CharacterTempleMissionProgress = sequelize.define(
  "CharacterTempleMissionProgress",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_event: { type: DataTypes.INTEGER, allowNull: false },
    character_id: { type: DataTypes.INTEGER, allowNull: false },
    mission_key: { type: DataTypes.STRING(80), allowNull: false },
    cycle_key: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "once" },
    progresso_atual: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    state_json: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    completed_at: { type: DataTypes.DATE, allowNull: true },
    claimed_at: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "character_temple_mission_progress" },
);

module.exports = CharacterTempleMissionProgress;
