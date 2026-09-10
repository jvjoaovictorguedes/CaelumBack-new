// src/routes/raceAbilitiesRoutes.js
const express = require("express");
const raceAbilitiesController = require("../controllers/raceAbilitiesController");

const router = express.Router();

// Rotas para RaceAbilities
router
  .route("/")
  .post(raceAbilitiesController.createRaceAbility) // POST para registrar uma nova habilidade de raça
  .get(raceAbilitiesController.getAllRaceAbilities); // GET para obter todas as habilidades de raça

// Rotas para operações que usam a chave primária composta (id_race e id_power)
router
  .route("/:id_race/:id_power")
  .get(raceAbilitiesController.getRaceAbilityByRaceAndPowerId) // GET por combinação de IDs
  .patch(raceAbilitiesController.updateRaceAbility) // PATCH por combinação de IDs
  .delete(raceAbilitiesController.deleteRaceAbility); // DELETE por combinação de IDs

module.exports = router;
