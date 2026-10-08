const { DataTypes: D } = require("sequelize");
const { sequelize } = require("../config/database");
const id = { type: D.INTEGER, primaryKey: true, autoIncrement: true };
const State = sequelize.define(
  "DiscordNewsState",
  {
    id: { type: D.INTEGER, primaryKey: true },
    enabled: D.BOOLEAN,
    auto_patch_notes: D.BOOLEAN,
    capture_since: D.DATE,
  },
  { tableName: "discord_news_state" },
);
const Change = sequelize.define(
  "DiscordNewsChange",
  {
    id,
    audit_id: { type: D.INTEGER, unique: true },
    entity: D.STRING(80),
    entity_id: D.INTEGER,
    name: D.STRING(200),
    diff: D.JSONB,
    release_env: D.STRING(20),
    status: D.STRING(20),
    approved_at: D.DATE,
  },
  { tableName: "discord_news_changes" },
);
const Delivery = sequelize.define(
  "DiscordNewsDelivery",
  {
    id,
    source_key: { type: D.STRING(100), unique: true },
    kind: D.STRING(20),
    source_id: D.INTEGER,
    payload: D.JSONB,
    status: D.STRING(20),
    available_at: D.DATE,
    attempts: D.INTEGER,
    message_id: D.STRING(30),
    channel_id: D.STRING(30),
    last_error: D.STRING(200),
  },
  { tableName: "discord_news_deliveries" },
);
const Interaction = sequelize.define(
  "DiscordNewsInteraction",
  {
    id: { type: D.STRING(30), primaryKey: true },
    user_id: { type: D.STRING(30), allowNull: false },
  },
  { tableName: "discord_news_interactions", updatedAt: false },
);
module.exports = { State, Change, Delivery, Interaction };
