// src/routes/expeditionRoutes.js
const express = require("express");
const expeditionController = require("../controllers/expeditionController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

router.get("/professions", authMiddleware, carregarPersonagemAtual, expeditionController.getProfissoes);
router.get("/regions", authMiddleware, carregarPersonagemAtual, expeditionController.getRegioes);
router.post("/regions/:regionId/collect", authMiddleware, carregarPersonagemAtual, expeditionController.coletar);

module.exports = router;
