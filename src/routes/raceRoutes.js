// src/routes/raceRoutes.js
const express = require("express");
const raceController = require("../controllers/raceController");

const router = express.Router();

// Rotas para Raças
router
  .route("/")
  .post(raceController.createRace) // POST para criar uma nova raça, com validação
  .get(raceController.getAllRaces); // GET para obter todas as raças

router
  .route("/:id")
  .get(raceController.getRaceById) // GET para obter uma raça específica por ID
  .patch(raceController.updateRace) // PATCH para atualizar uma raça, com validação
  .delete(raceController.deleteRace); // DELETE para deletar uma raça

module.exports = router;
