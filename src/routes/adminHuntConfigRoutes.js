// Painel Administrativo Fase 11 — montada sob /api/admin/hunts/config
// (permissão hunts.manage).
const express = require("express");
const adminHuntConfigController = require("../controllers/adminHuntConfigController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();
router.use(authMiddleware, adminMiddleware, requireAdminPermission("hunts.manage"));

router.get("/", adminHuntConfigController.obter);
router.put("/", adminHuntConfigController.atualizar);

module.exports = router;
