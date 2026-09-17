// src/routes/raceRoutes.js
const express = require("express");
const raceController = require("../controllers/raceController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const { criarLimitador } = require("../middlewares/rateLimitMiddleware");

const router = express.Router();

// Sem isso, nada impedia o cliente de chamar /sortear-raro em loop até
// ganhar — cada tentativa é um sorteio independente (0.9% de chance), e
// sem limite nenhum um script simples "vence" o sorteio em minutos
// (esperado ~111 tentativas). Por CONTA (req.user.id), não por IP —
// authMiddleware já roda antes e garante req.user aqui.
const limitadorSorteioRaro = criarLimitador({
  janelaMs: 60 * 60 * 1000,
  maxTentativas: 5,
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
