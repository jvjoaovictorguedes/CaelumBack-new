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

// Arena Ranqueada (PvP v2) — separada do Duelo casual acima, nunca
// reaproveita PvpStatus/PvpMatches (ver rankedController.js).
//
// DEPRECATED: matchmaking por fila foi removido no PvP v2 — as duas
// rotas abaixo respondem 410 Gone apontando pra /ranked/match/start, em
// vez de sumirem e deixarem um cliente antigo com erro genérico.
router.post("/ranked/queue/join", authMiddleware, rankedController.filaRemovida);
router.post("/ranked/queue/leave", authMiddleware, rankedController.filaRemovida);

// §6 — o servidor escolhe o oponente; o corpo da requisição não tem
// nenhum campo de alvo (um enviado mesmo assim é ignorado/logado).
router.post(
  "/ranked/match/start",
  authMiddleware,
  carregarPersonagemAtual,
  rankedController.iniciarPartida,
);
router.get("/ranked/status", authMiddleware, carregarPersonagemAtual, rankedController.status);
router.get("/ranked/season", authMiddleware, rankedController.season);
router.get("/ranked/leaderboard", authMiddleware, rankedController.leaderboard);

module.exports = router;
