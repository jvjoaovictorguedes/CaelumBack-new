// Painel Administrativo — "Busca". Montada sob /api/admin/players.
const express = require("express");
const adminPlayerController = require("../controllers/adminPlayerController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();

router.use(authMiddleware, adminMiddleware, requireAdminPermission("players.view"));

router.get("/search", adminPlayerController.buscar);
router.get("/:id", adminPlayerController.detalhe);

module.exports = router;
