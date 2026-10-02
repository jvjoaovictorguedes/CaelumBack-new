// Dashboard V2 — montada sob /api/dashboard.
const express = require("express");
const dashboardController = require("../controllers/dashboardController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

router.get("/summary", authMiddleware, carregarPersonagemAtual, dashboardController.obterResumo);

module.exports = router;
