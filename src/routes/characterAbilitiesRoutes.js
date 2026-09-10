// src/routes/characterAbilitiesRoutes.js
const express = require("express");
const characterAbilitiesController = require("../controllers/characterAbilitiesController");

const router = express.Router();

// Rotas para CharacterAbilities
router
  .route("/")
  .post(characterAbilitiesController.createCharacterAbility) // POST para registrar uma nova habilidade
  .get(characterAbilitiesController.getAllCharacterAbilities); // GET para obter todas as habilidades registradas

router
  .route("/:id")
  .get(characterAbilitiesController.getCharacterAbilityById) // GET por ID da entrada da tabela
  .patch(characterAbilitiesController.updateCharacterAbility) // PATCH por ID da entrada
  .delete(characterAbilitiesController.deleteCharacterAbility); // DELETE por ID da entrada

module.exports = router;
