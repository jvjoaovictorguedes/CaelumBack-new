// Painel Administrativo Fase 10 — montada sob /api/admin/spoils/config
// (permissão spoils.manage).
const express = require("express");
const adminSpoilConfigController = require("../controllers/adminSpoilConfigController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();
router.use(authMiddleware, adminMiddleware, requireAdminPermission("spoils.manage"));

router.get("/", adminSpoilConfigController.obter);
router.put("/", adminSpoilConfigController.atualizar);

module.exports = router;
