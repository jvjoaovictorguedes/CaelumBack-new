// Sistema de Taverna — rotas do jogador, montadas sob /api/tavern.
const express = require("express");
const tavernController = require("../controllers/tavernController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();
router.use(authMiddleware, carregarPersonagemAtual);

router.get("/rest/preview", tavernController.previewDescanso);
router.post("/rest", tavernController.confirmarDescanso);

module.exports = router;
