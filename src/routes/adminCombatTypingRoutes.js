const router = require("express").Router();
const service = require("../services/combatTypingAdminService");
const typing = require("../services/combatTypingService");
const permission = require("../middlewares/requireAdminPermission");
router.use(
  require("../middlewares/authMiddleware"),
  require("../middlewares/adminMiddleware"),
);
const handle = (operation) => async (req, res, next) => {
  try {
    res.json({ status: "success", data: await operation(req) });
  } catch (e) {
    if (e.statusCode || e.name?.startsWith("Sequelize"))
      return res
        .status(e.statusCode ?? 400)
        .json({
          message: e.statusCode
            ? e.message
            : "Dados inválidos, chave duplicada ou referência em uso.",
        });
    next(e);
  }
};
router.get(
  "/",
  permission("combat_typing.view"),
  handle(async () => ({
    catalogs: await typing.catalog(),
    config: typing.config(),
    metrics: typing.summaries(),
  })),
);
router.get(
  "/preview/:kind/:id",
  permission("combat_typing.view"),
  handle(async (req) => {
    const id = service.id(req.params.id);
    await typing.catalog();
    const kind = req.params.kind;
    if (!["families", "profiles"].includes(kind))
      throw Object.assign(new Error("Preview inválido"), { statusCode: 400 });
    const profile = typing.monsterProfile(
      kind === "families"
        ? { monster_family_id: id }
        : { affinity_profile_id: id },
    );
    return {
      profile,
      affinities: typing.publicDefense({ combatTyping: profile }),
    };
  }),
);
router.put(
  "/config",
  permission("combat_typing.manage"),
  handle(service.saveConfig),
);
router.post(
  "/simulate",
  permission("combat_typing.view"),
  handle((req) => service.simulate(req.body)),
);
router.get(
  "/catalog/:kind",
  permission("combat_typing.view"),
  handle((req) => service.listCatalog(req.params.kind)),
);
router.post(
  "/catalog/:kind",
  permission("combat_typing.manage"),
  handle((req) => service.saveCatalog(req, req.params.kind, null)),
);
router.put(
  "/catalog/:kind/:id",
  permission("combat_typing.manage"),
  handle((req) =>
    service.saveCatalog(req, req.params.kind, service.id(req.params.id)),
  ),
);
router.get(
  "/entities/:kind",
  permission("combat_typing.view"),
  handle((req) => service.listEntities(req.params.kind)),
);
router.get(
  "/entities/:kind/:id",
  permission("combat_typing.view"),
  handle((req) => service.detail(req.params.kind, service.id(req.params.id))),
);
router.put(
  "/entities/:kind/:id",
  permission("combat_typing.manage"),
  handle((req) =>
    service.saveEntity(req, req.params.kind, service.id(req.params.id)),
  ),
);
module.exports = router;
