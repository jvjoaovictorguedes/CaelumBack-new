// src/routes/bestiaryRoutes.js
const express = require("express");
const bestiaryController = require("../controllers/bestiaryController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

router.get("/", authMiddleware, carregarPersonagemAtual, bestiaryController.listarRegioes);
router.get("/regions/:regionId", authMiddleware, carregarPersonagemAtual, bestiaryController.obterRegiao);

module.exports = router;
