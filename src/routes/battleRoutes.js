const express = require("express");

const battleController = require("../controllers/battleController");

const authMiddleware = require("../middlewares/authMiddleware");

const {
  carregarPersonagemAtual,
} = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

router.post(
  "/start",
  authMiddleware,
  carregarPersonagemAtual,
  battleController.iniciar,
);

router.get("/:battleId", authMiddleware, battleController.obter);

router.post(
  "/:battleId/join",
  authMiddleware,
  carregarPersonagemAtual,
  battleController.entrar,
);

module.exports = router;
