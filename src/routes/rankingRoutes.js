// src/routes/rankingRoutes.js
const express = require("express");
const rankingController = require("../controllers/rankingController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

router.get("/", authMiddleware, carregarPersonagemAtual, rankingController.obterRanking);

module.exports = router;
