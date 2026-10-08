const {
  MemoryRateLimitStore,
} = require("./rateLimitStore/memoryRateLimitStore");
const { policy } = require("./automationPolicyService");
const { recordSignal } = require("./automationTelemetryService");
const { failure } = require("./antiAutomationErrors");
let store = new MemoryRateLimitStore();
async function check(characterId, actionType) {
  const config = policy();
  if (!config.enabled) return;
  // Flood ceiling only. Gameplay timers remain in their own services.
  const result = await store.consume(`${characterId}:${actionType}`, {
    now: Date.now(),
    windowMs: 10000,
    limit: 60,
  });
  if (result.allowed) return;
  void recordSignal({ characterId, type: "RATE_LIMIT_HAMMERING", actionType });
  if (config.rate_limit_enabled && !config.shadow_mode)
    throw failure("ACTION_RATE_LIMITED", 429, result.retryAfterMs);
}
function setStore(nextStore) {
  if(typeof nextStore?.consume !== "function")throw new TypeError("Rate limit store must implement consume");
  store=nextStore;
}
module.exports = { check, setStore };
