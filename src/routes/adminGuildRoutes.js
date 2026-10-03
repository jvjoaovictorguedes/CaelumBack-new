// Painel Administrativo — Guilda. Montada sob /api/admin/guild.
const express = require("express");
const adminGuildController = require("../controllers/adminGuildController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();

router.use(authMiddleware, adminMiddleware, requireAdminPermission("guild.manage"));

router.get("/balance", adminGuildController.obterBalanceamento);
router.put("/balance/:group", adminGuildController.atualizarBalanceamento);

router.get("/levels", adminGuildController.listarNiveis);
router.post("/levels", adminGuildController.upsertNivel);

router.get("/bosses", adminGuildController.listarBosses);
router.post("/bosses", adminGuildController.criarBoss);
router.patch("/bosses/:id", adminGuildController.atualizarBoss);
router.get("/bosses/:id/abilities", adminGuildController.listarAbilitiesDoBoss);
router.put("/bosses/:id/abilities", adminGuildController.sincronizarAbilitiesDoBoss);

module.exports = router;
