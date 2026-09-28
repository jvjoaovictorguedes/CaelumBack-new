// src/routes/raceRoutes.js
const express = require("express");
const raceController = require("../controllers/raceController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const { criarLimitador } = require("../middlewares/rateLimitMiddleware");

const router = express.Router();

// A proteção de verdade contra "chamar em loop até ganhar" é o
// CharacterCreationRoll.race_roll_done — o resultado é decidido e
// gravado na PRIMEIRA chamada bem-sucedida, e toda chamada seguinte só
// lê esse resultado já travado (nunca sorteia de novo). Esse rate limit
// é só uma segunda camada (evita bater a rota sem necessidade), não
// precisa ser apertado — um limite baixo demais (era 5/hora) derrubava
// jogadores legítimos que só tentaram de novo depois de uma falha de
// rede/timeout no meio do wizard de criação, travando a criação de
// personagem por até 1h sem eles saberem o motivo real (o frontend só
// mostrava "falha de conexão" em vez do 429 de verdade).
const limitadorSorteioRaro = criarLimitador({
  janelaMs: 60 * 60 * 1000,
  maxTentativas: 30,
  obterChave: (req) => `raca-rara:${req.user.id}`,
});

// Dado de jogo: leitura continua aberta (o front lê direto sem JWT
// ainda), só criar/editar/remover exige admin — nenhuma tela de jogador
// chama essas escritas.
router
  .route("/")
  .post(authMiddleware, adminMiddleware, raceController.createRace)
  .get(raceController.getAllRaces);

// Precisa vir antes de "/:id" — senão o Express casa "sortear-raro" com
// o parâmetro :id.
router.post("/sortear-raro", authMiddleware, limitadorSorteioRaro, raceController.sortearRacaRara);

router
  .route("/:id")
  .get(raceController.getRaceById)
  .patch(authMiddleware, adminMiddleware, raceController.updateRace)
  .delete(authMiddleware, adminMiddleware, raceController.deleteRace);

module.exports = router;
