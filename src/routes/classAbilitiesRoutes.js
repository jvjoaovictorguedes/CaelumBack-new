// src/routes/classAbilitiesRoutes.js
const express = require("express");
const classAbilitiesController = require("../controllers/classAbilitiesController");

const router = express.Router();

// Rotas para ClassAbilities
router
  .route("/")
  .post(classAbilitiesController.createClassAbility) // POST para registrar uma nova habilidade de classe
  .get(classAbilitiesController.getAllClassAbilities); // GET para obter todas as habilidades de classe

// Rotas para operações que usam a chave primária composta (id_classe e id_poder)
router
  .route("/:id_classe/:id_poder")
  .get(classAbilitiesController.getClassAbilityByClassAndPowerId) // GET por combinação de IDs
  .patch(classAbilitiesController.updateClassAbility) // PATCH por combinação de IDs
  .delete(classAbilitiesController.deleteClassAbility); // DELETE por combinação de IDs

module.exports = router;
