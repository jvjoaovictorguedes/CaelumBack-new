// src/routes/adventureRoutes.js
const express = require("express");
const adventureController = require("../controllers/adventureController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

router.get("/zones", authMiddleware, carregarPersonagemAtual, adventureController.listarZonasDisponiveis);
router.get("/session", authMiddleware, carregarPersonagemAtual, adventureController.obterSessaoAtual);
router.post(
  "/zones/:zoneId/enter",
  authMiddleware,
  carregarPersonagemAtual,
  adventureController.entrarNaAreaDeCaca,
);
router.post("/leave", authMiddleware, carregarPersonagemAtual, adventureController.sairDaAreaDeCaca);

module.exports = router;
