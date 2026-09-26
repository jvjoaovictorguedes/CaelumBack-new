// Painel Administrativo — montada sob /api/admin/unique-feats. Catálogo
// (listar/criar/editar) usa unique-feats.manage; conceder reaproveita
// players.reward (mesma permissão de Premiações de ouro/XP/item).
const express = require("express");
const adminUniqueFeatController = require("../controllers/adminUniqueFeatController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();
router.use(authMiddleware, adminMiddleware);

router.get("/", requireAdminPermission("unique-feats.manage"), adminUniqueFeatController.listar);
router.post("/", requireAdminPermission("unique-feats.manage"), adminUniqueFeatController.criar);
router.patch("/:id", requireAdminPermission("unique-feats.manage"), adminUniqueFeatController.atualizar);
router.post("/:id/grant", requireAdminPermission("players.reward"), adminUniqueFeatController.conceder);

module.exports = router;
