const express = require("express");
const onboardingController = require("../controllers/onboardingController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

router.get("/progresso", authMiddleware, carregarPersonagemAtual, onboardingController.obterProgresso);

module.exports = router;
