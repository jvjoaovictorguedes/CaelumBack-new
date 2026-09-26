// Modo Manutenção — montada sob /api/admin/maintenance. Permissão
// própria (maintenance.manage, só SuperAdmin por padrão) — é um
// kill-switch site-wide, mais restrito que as permissões de conteúdo.
const express = require("express");
const adminMaintenanceController = require("../controllers/adminMaintenanceController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();
router.use(authMiddleware, adminMiddleware, requireAdminPermission("maintenance.manage"));

router.get("/", adminMaintenanceController.obterStatus);
router.patch("/", adminMaintenanceController.atualizarStatus);

module.exports = router;
