// src/routes/consumablePropertiesRoutes.js
const express = require("express");
const consumablePropertiesController = require("../controllers/consumablePropertiesController");

const router = express.Router();

// Rotas para ConsumableProperties
// Note que POST e GET ALL usam a rota base, enquanto os outros usam o id_item na URL
router
  .route("/")
  .post(consumablePropertiesController.createConsumableProperties) // Criar propriedades para um item consumível
  .get(consumablePropertiesController.getAllConsumableProperties); // Obter todas as propriedades de consumíveis

// Rotas para operações por id_item (que é a PK)
router
  .route("/:id_item")
  .get(consumablePropertiesController.getConsumablePropertiesById) // Obter propriedades de um item consumível específico
  .patch(consumablePropertiesController.updateConsumableProperties) // Atualizar propriedades
  .delete(consumablePropertiesController.deleteConsumableProperties); // Deletar propriedades

module.exports = router;
