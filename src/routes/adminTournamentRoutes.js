// Rotas administrativas dos Torneios (PvP v2 §16/§17). Montadas sob
// /api/admin/pvp/tournaments.
//
// TODAS exigem authMiddleware + adminMiddleware + requireAdminPermission
// ("tournaments.manage") — adminMiddleware confere User.isAdmin no banco
// a partir de req.user.id; requireAdminPermission refina por RBAC. Nenhuma
// flag enviada pelo cliente participa dessa decisão. Painel Administrativo
// Fase 1: a chave já era seedada e exibida no hub, mas essas rotas nunca
// chegaram a checá-la (só isAdmin) — fechado aqui.
const express = require("express");
const tournamentController = require("../controllers/tournamentController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();

router.use(authMiddleware, adminMiddleware, requireAdminPermission("tournaments.manage"));

router.post("/", tournamentController.criar);
router.post("/:id/start", tournamentController.iniciar);
router.post("/:id/cancel", tournamentController.cancelar);
router.post("/:id/prize-delivered", tournamentController.marcarPremioEntregue);
router.post("/series/:serieId/resolve", tournamentController.resolverSerie);

module.exports = router;
