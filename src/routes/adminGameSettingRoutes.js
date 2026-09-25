// Painel Administrativo Fase 14 (§25) — montada sob /api/admin/settings.
const express = require("express");
const adminGameSettingController = require("../controllers/adminGameSettingController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();

router.use(authMiddleware, adminMiddleware, requireAdminPermission("economy.manage"));

router.get("/", adminGameSettingController.listar);
router.put("/:chave", adminGameSettingController.salvar);

module.exports = router;
