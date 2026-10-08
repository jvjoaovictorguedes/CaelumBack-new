const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Templo do Véu Celestial — Convergência (§3.1). Ciclo de vida:
// DRAFT -> SCHEDULED -> ACTIVE -> RELICARY_ONLY -> ENDED (ou
// CANCELLED). No máximo UM evento ACTIVE/RELICARY_ONLY por vez,
// garantido pelo índice único parcial temple_events_um_aberto_idx no
// banco — nunca só por um if no service.
const TempleEvent = sequelize.define(
  "TempleEvent",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    key: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    nome: { type: DataTypes.STRING(150), allowNull: false },
    lore: { type: DataTypes.TEXT, allowNull: true },
    teaser: { type: DataTypes.TEXT, allowNull: true },
    imagem_url: { type: DataTypes.STRING(255), allowNull: true },
    status: {
      type: DataTypes.ENUM("DRAFT", "SCHEDULED", "ACTIVE", "RELICARY_ONLY", "ENDED", "CANCELLED"),
      allowNull: false,
      defaultValue: "DRAFT",
    },
    starts_at: { type: DataTypes.DATE, allowNull: true },
    missions_end_at: { type: DataTypes.DATE, allowNull: true },
    relicary_end_at: { type: DataTypes.DATE, allowNull: true },
    ended_at: { type: DataTypes.DATE, allowNull: true },
    cancelled_at: { type: DataTypes.DATE, allowNull: true },
    cancel_reason: { type: DataTypes.TEXT, allowNull: true },
    id_currency_item: { type: DataTypes.INTEGER, allowNull: false },
    // §12.2 — freeze ao ativar; runtime do evento lê só isto, nunca o
    // catálogo editável (TempleMission/TempleRewardPool/TempleBossConfig).
    config_snapshot: { type: DataTypes.JSONB, allowNull: true },
  },
  { tableName: "temple_events" },
);

module.exports = TempleEvent;
