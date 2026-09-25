const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Sessão de captura (spec §14/§16) — motor síncrono via HTTP nesta
// implementação (ver decisão documentada em fishingService.js), mas o
// SERVIDOR continua 100% autoritativo: species_id/weight_g/behavior_seed
// nunca são expostos ao cliente antes do resultado final (spec §31).
const FishingSession = sequelize.define(
  "FishingSession",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    id_zone: { type: DataTypes.INTEGER, allowNull: false },
    id_instancia_vara: { type: DataTypes.INTEGER, allowNull: true },
    id_bait_item: { type: DataTypes.INTEGER, allowNull: true },
    id_species: { type: DataTypes.INTEGER, allowNull: true }, // oculto do cliente até revelar
    weight_g: { type: DataTypes.INTEGER, allowNull: true },
    behavior_seed: { type: DataTypes.INTEGER, allowNull: true },
    fase: {
      type: DataTypes.ENUM(
        "CREATED",
        "CASTING",
        "WAITING_BITE",
        "HOOK_WINDOW",
        "FIGHTING",
        "CAUGHT",
        "ESCAPED",
        "BROKEN_LINE",
        "EXPIRED",
        "ABORTED",
      ),
      allowNull: false,
      defaultValue: "CREATED",
    },
    tensao: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    progresso: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    sequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    resultado_payload: { type: DataTypes.JSONB, allowNull: true },
    mordida_disponivel_em: { type: DataTypes.DATE, allowNull: true },
    janela_mordida_expira_em: { type: DataTypes.DATE, allowNull: true },
    isca_consumida: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    started_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    finalized_at: { type: DataTypes.DATE, allowNull: true },
    result: { type: DataTypes.STRING(20), allowNull: true },
  },
  { tableName: "fishing_sessions" },
);

module.exports = FishingSession;
