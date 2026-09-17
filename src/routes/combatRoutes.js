// src/routes/combatRoutes.js
const express = require("express");
const combatController = require("../controllers/combatController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

router.get(
  "/enemy/:characterId",
  authMiddleware,
  carregarPersonagemAtual,
  combatController.gerarInimigoParaPersonagem,
);
router.post("/action", authMiddleware, carregarPersonagemAtual, combatController.executarTurno);

module.exports = router;
