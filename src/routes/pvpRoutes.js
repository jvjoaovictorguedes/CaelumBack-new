const express = require("express");
const pvpController = require("../controllers/pvpController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

router.get("/opponents/:characterId", pvpController.getOpponents);
router.get("/status/:characterId", pvpController.getStatus);
router.get("/ranking", pvpController.getRanking);
router.post("/challenge", authMiddleware, carregarPersonagemAtual, pvpController.challenge);

module.exports = router;
