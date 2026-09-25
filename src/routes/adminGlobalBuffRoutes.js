// Painel Administrativo Fase 15 — montada sob /api/admin/global-buffs,
// permissão events.manage ("Buff Global e outros eventos temporais").
const express = require("express");
const adminGlobalBuffController = require("../controllers/adminGlobalBuffController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();

router.use(authMiddleware, adminMiddleware, requireAdminPermission("events.manage"));

router.get("/", adminGlobalBuffController.listar);
router.post("/", adminGlobalBuffController.criar);
router.patch("/:id", adminGlobalBuffController.atualizar);
router.post("/:id/deactivate", adminGlobalBuffController.desativar);

module.exports = router;
