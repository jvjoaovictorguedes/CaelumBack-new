// src/routes/craftingRoutes.js
const express = require("express");
const craftingController = require("../controllers/craftingController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

router.get("/options", authMiddleware, carregarPersonagemAtual, craftingController.getOpcoesDeForja);
router.post("/craft", authMiddleware, carregarPersonagemAtual, craftingController.craftar);

module.exports = router;
