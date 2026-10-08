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
    combat_expires_at: {type: DataTypes.DATE},
    failed_at: {type: DataTypes.DATE},
    failure_reason: {type: DataTypes.STRING(30)},
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_world_boss_config: { type: DataTypes.INTEGER, allowNull: false },
    status: {
      type: DataTypes.ENUM("COOLDOWN", "DORMANT", "DISCOVERED", "ACTIVE", "DEFEATED", "CANCELLED", "FAILED"),
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
    // Ameaça Mundial V2 §9.1 — runtime persistente do relógio global do
    // Boss. NUNCA só em memória/setTimeout (§9.2/§23.2) — um restart
    // precisa retomar exatamente daqui.
    mana_current: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    boss_action_seq: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    phase_action_seq: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    furia_current_pct: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 0 },
    next_action_at: { type: DataTypes.DATE, allowNull: true },
    // Cooldowns/status ativos/cast em andamento (§6.6/§9.1) — formato
    // definido pelas Etapas 5/6.
    runtime_state: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    // §10.7 — vencedor oficial e dano final CONGELADOS na conclusão do
    // evento; depois disso o ranking final não muda mais.
    top_damage_character_id: { type: DataTypes.INTEGER, allowNull: true },
    top_damage_total: { type: DataTypes.BIGINT, allowNull: true },
  },
  { tableName: "world_boss_events" },
);

module.exports = WorldBossEvent;
