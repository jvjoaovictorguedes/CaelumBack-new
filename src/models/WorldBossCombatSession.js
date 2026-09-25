const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Sessão de combate individual contra o boss global (§9/§13/§31). HP/
// Mana reais continuam em Character.vida_atual/mana_atual — aqui só o
// que é exclusivo desta luta (status effects/cooldowns/turno). No
// máximo UMA sessão "Ativa" por personagem, garantido pelo índice
// único parcial world_boss_combat_sessions_um_ativo_idx no banco.
const WorldBossCombatSession = sequelize.define(
  "WorldBossCombatSession",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    event_id: { type: DataTypes.INTEGER, allowNull: false },
    character_id: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM("Ativo", "Encerrada"), allowNull: false, defaultValue: "Ativo" },
    action_seq: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    state: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  { tableName: "world_boss_combat_sessions" },
);

module.exports = WorldBossCombatSession;
