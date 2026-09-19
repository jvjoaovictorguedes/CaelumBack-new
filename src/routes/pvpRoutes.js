const express = require("express");
const pvpController = require("../controllers/pvpController");
const rankedController = require("../controllers/rankedController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

router.get("/opponents/:characterId", pvpController.getOpponents);
router.get("/status/:characterId", pvpController.getStatus);
router.get("/ranking", pvpController.getRanking);
router.post("/challenge", authMiddleware, carregarPersonagemAtual, pvpController.challenge);

// Arena Ranqueada (PvP Competitivo v1, §13) — separada do Duelo casual
// acima, nunca reaproveita PvpStatus/PvpMatches (ver rankedController.js).
router.post("/ranked/queue/join", authMiddleware, carregarPersonagemAtual, rankedController.entrarFila);
router.post("/ranked/queue/leave", authMiddleware, carregarPersonagemAtual, rankedController.sairFila);
router.get("/ranked/status", authMiddleware, carregarPersonagemAtual, rankedController.status);
router.get("/ranked/season", authMiddleware, rankedController.season);
router.get("/ranked/leaderboard", authMiddleware, rankedController.leaderboard);

module.exports = router;
