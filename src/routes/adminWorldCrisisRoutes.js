const router = require("express").Router();
const M = require("../models/worldCrisisModels");
const S = require("../services/adminWorldCrisisService");
const C = require("../services/worldCrisisConfigService");
const P = require("../middlewares/requireAdminPermission");
router.use(
  require("../middlewares/authMiddleware"),
  require("../middlewares/adminMiddleware"),
);
const handle = (fn) => async (req, res, next) => {
  try {
    res.json({ status: "success", data: await fn(req) });
  } catch (e) {
    if (e.statusCode || e.name?.startsWith("Sequelize"))
      return res
        .status(e.statusCode ?? 400)
        .json({
          message: e.statusCode
            ? e.message
            : "Chave duplicada ou referência inválida.",
        });
    next(e);
  }
};
router.get(
  "/preset",
  P("worldcrisis.manage"),
  handle(() => S.preset()),
);
router.get(
  "/catalogs",
  P("worldcrisis.manage"),
  handle(() => S.catalogs()),
);
router.get(
  "/configs",
  P("worldcrisis.manage"),
  handle(() => M.Config.findAll({ order: [["id", "ASC"]] })),
);
router.get(
  "/configs/:id",
  P("worldcrisis.manage"),
  handle((req) => M.Config.findByPk(req.params.id)),
);
router.post(
  "/configs",
  P("worldcrisis.manage"),
  handle((req) => S.save(req)),
);
for (const method of ["patch", "put"])
  router[method](
    "/configs/:id",
    P("worldcrisis.manage"),
    handle((req) => S.save(req, Number(req.params.id))),
  );
router.put(
  "/configs/:id/structure",
  P("worldcrisis.manage"),
  handle((req) => S.save(req, Number(req.params.id))),
);
router.post(
  "/configs/:id/duplicate",
  P("worldcrisis.manage"),
  handle((req) => S.duplicate(req, Number(req.params.id))),
);
for (const [action, active] of [
  ["deactivate", false],
  ["reactivate", true],
])
  router.post(
    `/configs/:id/${action}`,
    P("worldcrisis.manage"),
    handle((req) => S.activate(req, Number(req.params.id), active)),
  );
router.post(
  "/configs/:id/validate",
  P("worldcrisis.manage"),
  handle(async (req) => {
    const c = await M.Config.findByPk(req.params.id);
    if (!c) throw C.fail("Perfil inexistente.", 404);
    await C.validate(c.structure);
    return { valid: true };
  }),
);
router.post(
  "/configs/:id/preview",
  P("worldcrisis.manage"),
  handle((req) => S.preview(req.params.id)),
);
router.post(
  "/configs/:id/simulate-guild-scoring",
  P("worldcrisis.manage"),
  handle(async (req) => {
    const c = await M.Config.findByPk(req.params.id);
    if (!c) throw C.fail("Perfil inexistente.", 404);
    for (const k of [
      "raw_points",
      "unique_contributors",
      "member_count_snapshot",
    ])
      C.number(
        req.body[k],
        k === "member_count_snapshot" ? 1 : 0,
        1e9,
        k,
        true,
      );
    return C.guildScore(
      req.body.raw_points,
      req.body.unique_contributors,
      {
        member_count_snapshot: req.body.member_count_snapshot,
        existed_at_start: req.body.existed_at_start !== false,
      },
      c.structure.guild_scoring_config,
    );
  }),
);
router.put(
  "/settings",
  P("worldcrisis.manage"),
  handle((req) => S.settings(req)),
);
router.get(
  "/metrics",
  P("worldcrisis.manage"),
  handle(() => S.metrics()),
);
router.get(
  "/current",
  P("events.manage"),
  handle(() => require("../services/worldCrisisService").status()),
);
for (const action of [
  "pause",
  "resume",
  "force-complete-stage",
  "adjust-requirement",
  "override-effect",
  "announce",
  "force-resolve",
  "cancel",
])
  router.post(
    `/current/${action}`,
    P("events.manage"),
    handle((req) => S.live(req, action)),
  );
module.exports = router;
