const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Ciclo de vida de uma Ameaça Mundial (§6): COOLDOWN -> DORMANT ->
// DISCOVERED -> ACTIVE -> DEFEATED (ou CANCELLED). No máximo UM evento
// "aberto" (Dormant/Discovered/Active) por vez, garantido pelo índice
// único parcial world_boss_events_um_aberto_idx no banco — nunca só
// por um if no service.
const WorldBossEvent = sequelize.define(
  "WorldBossEvent",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_world_boss_config: { type: DataTypes.INTEGER, allowNull: false },
    status: {
      type: DataTypes.ENUM("COOLDOWN", "DORMANT", "DISCOVERED", "ACTIVE", "DEFEATED", "CANCELLED"),
      allowNull: false,
    },
    hp_max: { type: DataTypes.BIGINT, allowNull: false },
    hp_current: { type: DataTypes.BIGINT, allowNull: false },
    config_snapshot: { type: DataTypes.JSONB, allowNull: false },
    discoverer_character_id: { type: DataTypes.INTEGER, allowNull: true },
    discovery_zone_id: { type: DataTypes.INTEGER, allowNull: true },
    discovered_at: { type: DataTypes.DATE, allowNull: true },
    auto_awaken_at: { type: DataTypes.DATE, allowNull: true },
    activated_at: { type: DataTypes.DATE, allowNull: true },
    final_blow_character_id: { type: DataTypes.INTEGER, allowNull: true },
    defeated_at: { type: DataTypes.DATE, allowNull: true },
    next_eligible_at: { type: DataTypes.DATE, allowNull: true },
    // Nunca devolvido ao jogador (§5.2) — status público só expõe
    // ACTIVE/HP/fase, nunca discovery_threshold/discovery_progress.
    discovery_threshold: { type: DataTypes.BIGINT, allowNull: true },
    discovery_progress: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    participation_rewards_status: {
      type: DataTypes.ENUM("Pending", "Processing", "Done"),
      allowNull: false,
      defaultValue: "Pending",
    },
  },
  { tableName: "world_boss_events" },
);

module.exports = WorldBossEvent;
