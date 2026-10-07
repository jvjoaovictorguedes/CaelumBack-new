// src/routes/combatRoutes.js
const express = require("express");
const combatController = require("../controllers/combatController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const automation = require("../antiAutomation/httpMiddleware").protect("combat");

const router = express.Router();

router.get(
  "/enemy/:characterId",
  authMiddleware,
  carregarPersonagemAtual, automation,
  combatController.gerarInimigoParaPersonagem,
);
router.post("/action", authMiddleware, carregarPersonagemAtual, automation, combatController.executarTurno);

module.exports = router;
