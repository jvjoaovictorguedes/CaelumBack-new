// src/routes/weaponPropertiesRoutes.js
const express = require("express");
const weaponPropertiesController = require("../controllers/weaponPropertiesController");

const router = express.Router();

// Rotas para WeaponProperties
// Note que POST e GET ALL usam a rota base, enquanto os outros usam o id_item na URL
router
  .route("/")
  .post(weaponPropertiesController.createWeaponProperties) // Criar propriedades para um item arma
  .get(weaponPropertiesController.getAllWeaponProperties); // Obter todas as propriedades de armas

// Rotas para operações por id_item (que é a PK)
router
  .route("/:id_item")
  .get(weaponPropertiesController.getWeaponPropertiesById) // Obter propriedades de um item arma específico
  .patch(weaponPropertiesController.updateWeaponProperties) // Atualizar propriedades
  .delete(weaponPropertiesController.deleteWeaponProperties); // Deletar propriedades

module.exports = router;
