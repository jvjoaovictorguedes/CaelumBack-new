// Templo do Véu Celestial — rotas do jogador, montadas sob /api/temple.
const express = require("express");
const templeController = require("../controllers/templeController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");
const automation = require("../antiAutomation/httpMiddleware").protect("temple");

const router = express.Router();
router.use(authMiddleware, carregarPersonagemAtual);

router.get("/status", templeController.obterStatus);
router.get("/missions", templeController.listarMissoes);

router.use(automation);
router.post("/missions/:key/deliver", templeController.entregarItem);
router.post("/missions/:key/claim", templeController.reclamarRecompensa);

module.exports = router;
