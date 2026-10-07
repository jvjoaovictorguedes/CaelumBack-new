// src/routes/expeditionRoutes.js
const express = require("express");
const expeditionController = require("../controllers/expeditionController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const automation = require("../antiAutomation/httpMiddleware").protect("expedition");

const router = express.Router();

router.get("/professions", authMiddleware, carregarPersonagemAtual, automation, expeditionController.getProfissoes);
router.get("/regions", authMiddleware, carregarPersonagemAtual, automation, expeditionController.getRegioes);
router.post("/regions/:regionId/collect", authMiddleware, carregarPersonagemAtual, automation, expeditionController.coletar);

module.exports = router;
