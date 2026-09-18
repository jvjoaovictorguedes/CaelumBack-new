// src/routes/craftingRoutes.js
const express = require("express");
const craftingController = require("../controllers/craftingController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

router.get("/recipes", authMiddleware, carregarPersonagemAtual, craftingController.getReceitas);
router.get("/queue", authMiddleware, carregarPersonagemAtual, craftingController.getFila);
router.post("/start", authMiddleware, carregarPersonagemAtual, craftingController.iniciarForja);
router.post("/collect", authMiddleware, carregarPersonagemAtual, craftingController.coletarForja);

module.exports = router;
