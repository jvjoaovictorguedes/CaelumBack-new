const { sequelize } = require("../config/database");
const Risk = require("../models/AutomationRiskState");
const Event = require("../models/AutomationEvent");
const { policy } = require("./automationPolicyService");
const { reduce, weights } = require("./automationRiskService");
const seen = new Map();
function sanitize(metadata = {}) {
  const result = {};
  for (const key of ["actionType", "transport", "shadowDecision"])
    if (typeof metadata[key] === "string")
      result[key] = metadata[key].slice(0, 80);
  return result;
}
async function recordSignal({ characterId, type, actionType, metadata = {} }) {
  const config = policy();
  if (!config.enabled || !config.risk_enabled || !Object.hasOwn(weights, type))
    return;
  const key = `${characterId}:${type}:${actionType}`;
  const now = Date.now();
  // Coalesce retries/latency noise; do not store every click or body.
  if ((seen.get(key) || 0) > now - 60000) return;
  if (seen.size >= 10000)
    for (const [id, time] of seen) if (time < now - 60000) seen.delete(id);
  if (seen.size >= 10000) return;
  seen.set(key, now);
  try {
    await sequelize.transaction(async (transaction) => {
      await Risk.findOrCreate({
        where: { id_personagem: characterId },
        transaction,
      });
      const state = await Risk.findByPk(characterId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const update = reduce(state.toJSON(), type, now, config);
      const delta = update.risk_delta;
      delete update.risk_delta;
      await state.update(update, { transaction });
      await Event.create(
        {
          id_personagem: characterId,
          event_type: type,
          action_type: actionType,
          risk_delta: delta,
          metadata: sanitize({
            ...metadata,
            shadowDecision: config.shadow_mode ? update.status : undefined,
          }),
        },
        { transaction },
      );
    });
  } catch {
    seen.delete(key);
    console.warn("[antiAutomation] telemetry unavailable");
  }
}
module.exports = { recordSignal, sanitize };
