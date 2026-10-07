const cache = require("../services/gameSettingCache");
const defaults = Object.freeze({
  enabled: true,
  shadow_mode: true,
  risk_enabled: true,
  rate_limit_enabled: false,
  challenge_enabled: false,
  restriction_enabled: false,
  turnstile_fail_open: true,
  observation_threshold: 20,
  challenge_threshold: 60,
  restriction_threshold: 90,
  decay_per_hour: 5,
  verified_minutes: 60,
  restriction_minutes: 15,
  event_retention_days: 30,
  challenge_retention_days: 30,
});
function policy() {
  return Object.fromEntries(
    Object.entries(defaults).map(([key, value]) => [
      key,
      cache.obter(`anti_automation.${key}`, value),
    ]),
  );
}
function validate(values) {
  if (!values || typeof values !== "object" || Array.isArray(values))
    throw new Error("Configuração inválida.");
  for (const [key, value] of Object.entries(values)) {
    if (
      !(key in defaults) ||
      typeof value !== typeof defaults[key] ||
      (typeof value === "number" &&
        (!Number.isFinite(value) || value < 0 || value > 10000))
    )
      throw new Error(`Configuração inválida: ${key}`);
  }
  const merged = { ...policy(), ...values };
  if (
    !(
      merged.observation_threshold < merged.challenge_threshold &&
      merged.challenge_threshold < merged.restriction_threshold &&
      merged.restriction_threshold <= 100
    ) ||
    merged.event_retention_days < 1 ||
    merged.challenge_retention_days < 1 ||
    merged.verified_minutes < 1 ||
    merged.restriction_minutes < 1
  )
    throw new Error("Limites ou janelas inválidos.");
  return merged;
}
module.exports = { defaults, policy, validate };
