const { check } = require("./actionRateLimitService");
const { gate } = require("./automationChallengeService");
const { recordSignal } = require("./automationTelemetryService");
const { payload } = require("./antiAutomationErrors");
const safePoints = new Set([
  "/sessions/start",
  "/start",
  "/craft",
  "/smelt",
  "/refine",
  "/purchase",
  "/ranked/match/start",
  "/challenge",
  "/join",
  "/navigation/travel",
]);
function protect(domain) {
  return async (req, res, next) => {
    if (
      !["POST", "PUT", "PATCH", "DELETE"].includes(req.method) ||
      !req.personagemAtual
    )
      return next();
    const characterId = req.personagemAtual.id;
    const actionType =
      `${domain}:${req.route?.path || req.path.replace(/\/\d+(?=\/|$)/g, "/:id")}`.slice(
        0,
        80,
      );
    try {
      if (
        domain === "combat" &&
        req.path === "/action" &&
        (!Number.isInteger(req.body.stateVersion) ||
          typeof req.body.encounterId !== "string")
      )
        throw require("./antiAutomationErrors").failure(
          "INVALID_ACTION_STATE",
          409,
        );
      // Active fights/reel/claims are never interrupted by adaptive friction.
      if (safePoints.has(req.path) || /\/regions\/\d+\/collect$/.test(req.path))
        await gate(characterId, actionType);
      await check(characterId, actionType);
      res.once("finish", () => {
        if (res.statusCode === 409)
          void recordSignal({
            characterId,
            type: res.locals.automationSignal || "INVALID_STATE",
            actionType,
            metadata: { transport: "http" },
          });
        if (
          res.statusCode >= 200 &&
          res.statusCode < 300 &&
          require("./automationBehaviorService").observe(
            characterId,
            actionType,
          )
        )
          void recordSignal({
            characterId,
            type: "PERFECT_PERIODICITY",
            actionType,
            metadata: { transport: "http" },
          });
      });
      next();
    } catch (error) {
      if (error.code) return res.status(error.statusCode).json(payload(error));
      next(error);
    }
  };
}
module.exports = { protect };
