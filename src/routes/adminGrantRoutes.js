// Painel Administrativo Fase 12 — montada sob /api/admin/grants. Busca
// usa players.view ("Consultar jogador") e conceder usa players.reward
// ("Conceder premiações") — permissões separadas de propósito (ver Fase
// 1: a role Suporte tem players.view mas NÃO players.reward — pode
// procurar um jogador, nunca premiar).
const express = require("express");
const adminGrantController = require("../controllers/adminGrantController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();
router.use(authMiddleware, adminMiddleware);

router.get("/search", requireAdminPermission("players.view"), adminGrantController.buscar);
router.post("/:id", requireAdminPermission("players.reward"), adminGrantController.conceder);

module.exports = router;
