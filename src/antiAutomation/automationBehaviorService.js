const samples = new Map();
function observe(characterId, actionType, now = Date.now()) {
  const key = `${characterId}:${actionType}`;
  let sample = samples.get(key);
  if (!sample || now - sample.last > 3600000) {
    if (samples.size >= 10000)
      for (const [id, value] of samples)
        if (now - value.last > 3600000) samples.delete(id);
    if (samples.size >= 10000) return false;
    sample = { last: now, intervals: [] };
    samples.set(key, sample);
    return false;
  }
  const interval = now - sample.last;
  sample.last = now;
  if (interval <= 0) return false;
  sample.intervals.push(interval);
  if (sample.intervals.length > 64) sample.intervals.shift();
  if (sample.intervals.length < 64) return false;
  const mean = sample.intervals.reduce((a, b) => a + b, 0) / 64;
  const variance =
    sample.intervals.reduce((sum, n) => sum + (n - mean) ** 2, 0) / 64;
  return mean >= 1000 && Math.sqrt(variance) / mean < 0.01;
}
module.exports = { observe };
