// Templo do Véu Celestial — rotas do jogador, montadas sob /api/temple.
const express = require("express");
const templeController = require("../controllers/templeController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();
router.use(authMiddleware, carregarPersonagemAtual);

router.get("/status", templeController.obterStatus);

module.exports = router;
