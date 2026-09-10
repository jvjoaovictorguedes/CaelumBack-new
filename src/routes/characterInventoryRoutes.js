// src/routes/characterInventoryRoutes.js
const express = require("express");
const characterInventoryController = require("../controllers/characterInventoryController");

const router = express.Router();

// Rotas para CharacterInventory
router
  .route("/")
  .post(characterInventoryController.createCharacterInventory) // POST para adicionar item ao inventário
  .get(characterInventoryController.getAllCharacterInventory); // GET para obter todas as entradas de inventário (ou por personagemId)

router
  .route("/:id") // id aqui refere-se a id_personagem_inventario
  .get(characterInventoryController.getCharacterInventoryById) // GET por ID da entrada
  .patch(characterInventoryController.updateCharacterInventory) // PATCH por ID da entrada
  .delete(characterInventoryController.deleteCharacterInventory); // DELETE por ID da entrada

module.exports = router;
