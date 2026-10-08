const crisis = require("./worldCrisisService");
// Small row lookup, no in-process authority: every payout sees the committed stage.
async function apply(xp, gold, context, transaction) {
  const effect = crisis.effects(await crisis.current(transaction), context);
  return {
    xp: Math.max(0, Math.round(xp * (1 - effect.xp_pct / 100))),
    gold: Math.max(0, Math.round(gold * (1 - effect.gold_pct / 100))),
    crisis_penalty: effect,
  };
}
module.exports = { apply };
