// src/routes/raceRoutes.js
const express = require("express");
const raceController = require("../controllers/raceController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");

const router = express.Router();

// Dado de jogo: leitura continua aberta (o front lê direto sem JWT
// ainda), só criar/editar/remover exige admin — nenhuma tela de jogador
// chama essas escritas.
router
  .route("/")
  .post(authMiddleware, adminMiddleware, raceController.createRace)
  .get(raceController.getAllRaces);

// Precisa vir antes de "/:id" — senão o Express casa "sortear-raro" com
// o parâmetro :id.
router.post("/sortear-raro", authMiddleware, raceController.sortearRacaRara);

router
  .route("/:id")
  .get(raceController.getRaceById)
  .patch(authMiddleware, adminMiddleware, raceController.updateRace)
  .delete(authMiddleware, adminMiddleware, raceController.deleteRace);

module.exports = router;
