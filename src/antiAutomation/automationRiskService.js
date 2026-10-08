const weights = Object.freeze({
  ACTION_REPLAY: 4,
  INVALID_STATE: 2,
  ACTION_TOO_FAST: 1,
  IMPOSSIBLE_CONCURRENCY: 5,
  RATE_LIMIT_HAMMERING: 4,
  PERFECT_PERIODICITY: 2,
  CHALLENGE_FAILED: 6,
  CHALLENGE_PASSED: -20,
});
function reduce(state, type, now, config) {
  const previous = Number(state.score) || 0;
  const elapsed = Math.max(
    0,
    now - new Date(state.last_decay_at || now).getTime(),
  );
  const decayed = Math.max(
    0,
    previous - (elapsed / 3600000) * config.decay_per_hour,
  );
  const score = Math.max(0, Math.min(100, decayed + (weights[type] || 0)));
  // At least two independent signal families are necessary for automatic friction.
  const families = [
    ...new Set([
      ...(decayed > 0 ? state.signal_families || [] : []),
      ...(type === "CHALLENGE_PASSED" ? [] : [type]),
    ]),
  ];
  const status =
    score >= config.challenge_threshold && families.length >= 2
      ? "CHALLENGE_PENDING"
      : score >= config.observation_threshold
        ? "OBSERVATION"
        : "NORMAL";
  return {
    score,
    status,
    signal_families: families,
    last_decay_at: new Date(now),
    last_signal_at: new Date(now),
    risk_delta: score - previous,
  };
}
module.exports = { reduce, weights };
