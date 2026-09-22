// Rotas de jogador dos Torneios (PvP v2 §16/§19). Montadas sob
// /api/pvp/tournaments (ver pvpRoutes.js).
const express = require("express");
const tournamentController = require("../controllers/tournamentController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

router.get("/", authMiddleware, tournamentController.listar);
router.get("/me/podium", authMiddleware, carregarPersonagemAtual, tournamentController.meuPodio);
router.get("/:id", authMiddleware, tournamentController.detalhar);
router.post("/:id/join", authMiddleware, carregarPersonagemAtual, tournamentController.inscrever);
router.post("/:id/leave", authMiddleware, carregarPersonagemAtual, tournamentController.desinscrever);

module.exports = router;
