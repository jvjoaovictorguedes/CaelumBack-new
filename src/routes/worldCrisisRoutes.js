const router = require("express").Router();
const M = require("../models/worldCrisisModels");
const crisis = require("../services/worldCrisisService");
const { fail } = require("../services/worldCrisisConfigService");
router.use(
  require("../middlewares/authMiddleware"),
  require("../middlewares/currentCharacterMiddleware").carregarPersonagemAtual,
);
const handle = (fn) => async (req, res, next) => {
  try {
    res.json({ status: "success", data: await fn(req) });
  } catch (e) {
    if (e.statusCode)
      return res.status(e.statusCode).json({ message: e.message });
    next(e);
  }
};
router.get(
  "/status",
  handle((req) => crisis.status(req.personagemAtual.id)),
);
router.get(
  "/requirements",
  handle((req) =>
    require("../services/worldCrisisContributionService").requirements(
      req.personagemAtual.id,
    ),
  ),
);
router.post(
  "/contribute",
  require("../antiAutomation/httpMiddleware").protect("inventory"),
  handle((req) =>
    require("../services/worldCrisisContributionService").contribute(
      req.personagemAtual.id,
      req.body,
    ),
  ),
);
router.get(
  "/ranking",
  handle(async (req) => {
    const e = req.query.eventId
      ? await M.Event.findByPk(req.query.eventId)
      : await crisis.latest();
    return e
      ? require("../services/worldCrisisRankingService").rankings(
          e,
          req.personagemAtual.id,
          req.query,
        )
      : { rows: [], me: null };
  }),
);
router.get(
  "/me",
  handle(async (req) => {
    const e = await crisis.latest();
    return e
      ? require("../services/worldCrisisRankingService").rankings(
          e,
          req.personagemAtual.id,
        )
      : { me: null };
  }),
);
router.post(
  "/announcements/ack",
  handle((req) =>
    require("../services/worldCrisisAnnouncementService").ack(
      req.personagemAtual.id,
      req.body.event_id,
      req.body.seq,
    ),
  ),
);
router.get(
  "/history",
  handle(() =>
    M.Event.findAll({
      where: { status: ["COMPLETED", "CANCELLED"] },
      attributes: [
        "id",
        "status",
        "started_at",
        "completed_at",
        "current_stage_key",
      ],
      order: [["id", "DESC"]],
      limit: 50,
    }),
  ),
);
router.get(
  "/history/:eventId",
  handle(async (req) => {
    const e = await M.Event.findByPk(req.params.eventId);
    if (!e || e.status === "ACTIVE") throw fail("Resultado indisponível.", 404);
    return {
      ...(await crisis.status(req.personagemAtual.id, e)),
      rankings: e.final_rankings,
    };
  }),
);
module.exports = router;
