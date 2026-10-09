const express = require("express");
const router = express.Router();
const service = require("../services/discordNewsService");
router.use(
  require("../middlewares/authMiddleware"),
  require("../middlewares/adminMiddleware"),
  require("../middlewares/requireAdminPermission")("discordnews.manage"),
);
const wrap = (handler) => async (req, res) => {
  try {
    res.json({ status: "success", data: await handler(req) });
  } catch (e) {
    res
      .status(e.statusCode || 500)
      .json({
        message: e.statusCode
          ? e.message
          : "Não foi possível processar News Caelum.",
      });
  }
};
const actor = (req) => ({ idAdmin: req.user.id, req });
router.get(
  "/",
  wrap(() => service.dashboard()),
);
router.patch(
  "/settings",
  wrap((req) => service.updateSettings(req.body, actor(req))),
);
router.post(
  "/changes/:id/review",
  wrap((req) => service.reviewChange(req.params.id, req.body, actor(req))),
);
router.post(
  "/patches/:id/queue",
  wrap((req) => service.queuePatch(req.params.id, req.body, actor(req))),
);
router.post(
  "/deliveries/:id/retry",
  wrap((req) => service.retry(req.params.id, req.body, actor(req))),
);
router.post(
  "/deliveries/:id/reconcile",
  wrap((req) => service.reconcile(req.params.id, req.body, actor(req))),
);
module.exports = router;
