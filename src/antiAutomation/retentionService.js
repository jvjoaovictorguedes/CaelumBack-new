const { Op } = require("sequelize");
const { policy } = require("./automationPolicyService");
async function prune() {
  const config = policy();
  await require("../models/AutomationEvent").destroy({
    where: {
      createdAt: {
        [Op.lt]: new Date(Date.now() - config.event_retention_days * 86400000),
      },
    },
  });
  await require("../models/AutomationChallenge").destroy({
    where: {
      createdAt: {
        [Op.lt]: new Date(
          Date.now() - config.challenge_retention_days * 86400000,
        ),
      },
      expires_at: { [Op.lt]: new Date() },
    },
  });
}
function start() {
  const timer = setInterval(
    () =>
      prune().catch(() =>
        console.warn("[antiAutomation] retention unavailable"),
      ),
    3600000,
  );
  timer.unref();
  return timer;
}
module.exports = { prune, start };
