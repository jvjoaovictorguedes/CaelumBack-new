const router = require("express").Router();
const auth = require("../middlewares/authMiddleware");
const {
  carregarPersonagemAtual,
} = require("../middlewares/currentCharacterMiddleware");
const service = require("../antiAutomation/automationChallengeService");
const { payload } = require("../antiAutomation/antiAutomationErrors");
const { check } = require("../antiAutomation/actionRateLimitService");
router.use(
  auth,
  carregarPersonagemAtual,
  require("../middlewares/rateLimitMiddleware").criarLimitador({
    janelaMs: 60000,
    maxTentativas: 30,
    obterChave: (req) => `verification:${req.user.id}`,
  }),
);
const handle = (operation) => async (req, res, next) => {
  try {
    await check(req.personagemAtual.id, "CHALLENGE_API");
    res.json({ status: "success", data: await operation(req) });
  } catch (error) {
    if (error.code) return res.status(error.statusCode).json(payload(error));
    next(error);
  }
};
router.get(
  "/status",
  handle((req) => service.issue(req.personagemAtual.id)),
);
router.post(
  "/verify",
  handle((req) =>
    service.verify(
      req.personagemAtual.id,
      req.body.challengeId,
      req.body.token,
    ),
  ),
);
module.exports = router;
