// Rotas administrativas dos Torneios (PvP v2 §16/§17). Montadas sob
// /api/admin/pvp/tournaments.
//
// TODAS exigem authMiddleware + adminMiddleware — adminMiddleware
// confere User.isAdmin no banco a partir de req.user.id; nenhuma flag
// enviada pelo cliente participa dessa decisão.
const express = require("express");
const tournamentController = require("../controllers/tournamentController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");

const router = express.Router();

router.post("/", authMiddleware, adminMiddleware, tournamentController.criar);
router.post("/:id/start", authMiddleware, adminMiddleware, tournamentController.iniciar);
router.post("/:id/cancel", authMiddleware, adminMiddleware, tournamentController.cancelar);
router.post(
  "/:id/prize-delivered",
  authMiddleware,
  adminMiddleware,
  tournamentController.marcarPremioEntregue,
);
router.post(
  "/series/:serieId/resolve",
  authMiddleware,
  adminMiddleware,
  tournamentController.resolverSerie,
);

module.exports = router;
