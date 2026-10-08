const { sequelize } = require("../config/database");
const Event = require("../models/WorldBossEvent");
const crisis = require("./worldCrisisService");
function expired(event, now = new Date()) {
  return (
    event.status === "ACTIVE" &&
    event.combat_expires_at &&
    now.getTime() >= new Date(event.combat_expires_at).getTime()
  );
}
async function failLocked(event, transaction, now = new Date()) {
  if (!expired(event, now)) return false;
  event.status = "FAILED";
  event.failed_at = now;
  event.failure_reason = "TIMEOUT";
  event.runtime_state = {
    ...event.runtime_state,
    failure_metrics: {
      hp_remaining: Number(event.hp_current),
      hp_pct:
        (100 * Number(event.hp_current)) / Math.max(1, Number(event.hp_max)),
      duration_ms: now - new Date(event.activated_at),
      participants: await require("../models/WorldBossContribution").count({
        where: { event_id: event.id },
        transaction,
      }),
      damage_total: Number(event.hp_max) - Number(event.hp_current),
    },
  };
  await event.save({ transaction });
  await require("../models/WorldBossCombatSession").update(
    { status: "Encerrada" },
    { where: { event_id: event.id, status: "Ativo" }, transaction },
  );
  const c = await crisis.trigger(event, transaction);
  transaction.afterCommit(() => {
    require("../socket/worldBossSocket").emitGlobal("worldboss:failed", {
      event_id: event.id,
      status: "FAILED",
      hp_current: Number(event.hp_current),
      failed_at: now,
      crisis_event_id: c?.id ?? null,
    });
  });
  return true;
}
async function tick({ recover = false } = {}) {
  await sequelize.transaction(async (transaction) => {
    const e = await Event.findOne({
      where: { status: "ACTIVE" },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (e) await failLocked(e, transaction);
  });
  // Recover a FAILED event if interruption happened in a previous deployment/operation.
  if (!recover) return;
  const failed = await Event.findAll({ where: { status: "FAILED" } });
  for (const e of failed) {
    if (!e.config_snapshot.failure_crisis_snapshot) continue;
    if (
      !(await require("../models/worldCrisisModels").Event.findOne({
        where: { source_id: e.id },
      })) &&
      !(await crisis.current())
    )
      await sequelize.transaction((t) => crisis.trigger(e, t));
  }
}
function deadline(event, now = new Date()) {
  const duration = event.config_snapshot?.combat_duration_seconds;
  event.combat_expires_at = duration
    ? new Date(now.getTime() + duration * 1000)
    : null;
}
module.exports = { expired, failLocked, tick, deadline };
