// src/routes/armorPropertiesRoutes.js
const express = require("express");
const armorPropertiesController = require("../controllers/armorPropertiesController");
const router = express.Router();

// Rotas para ArmorProperties
// Note que POST e GET ALL usam a rota base, enquanto os outros usam o id_item na URL
router
  .route("/")
  .post(armorPropertiesController.createArmorProperties) // Criar propriedades para um item
  .get(armorPropertiesController.getAllArmorProperties); // Obter todas as propriedades

// Rotas para operações por id_item (que é a PK)
router
  .route("/:id_item")
  .get(armorPropertiesController.getArmorPropertiesById) // Obter propriedades de um item específico
  .patch(armorPropertiesController.updateArmorProperties) // Atualizar propriedades
  .delete(armorPropertiesController.deleteArmorProperties); // Deletar propriedades

module.exports = router;
