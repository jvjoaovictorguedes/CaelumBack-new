// src/routes/worldRoutes.js
const express = require("express");
const worldMapController = require("../controllers/worldMapController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

router.get("/map", authMiddleware, carregarPersonagemAtual, worldMapController.obterMapa);

module.exports = router;
