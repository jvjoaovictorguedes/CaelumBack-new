// src/routes/characterInventoryRoutes.js
const express = require("express");
const characterInventoryController = require("../controllers/characterInventoryController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");

const router = express.Router();

// Conceder item diretamente (sem passar pela loja) é operação
// administrativa — nenhuma tela de jogador chama isso; era um POST
// público que dava item de graça pra quem soubesse o endpoint. As
// leituras continuam abertas por enquanto (o front ainda não manda o
// JWT nessas chamadas).
router
  .route("/")
  .post(authMiddleware, adminMiddleware, characterInventoryController.createCharacterInventory)
  .get(characterInventoryController.getAllCharacterInventory);

router
  .route("/:id") // id aqui refere-se a id_personagem_inventario
  .get(characterInventoryController.getCharacterInventoryById)
  .patch(authMiddleware, adminMiddleware, characterInventoryController.updateCharacterInventory)
  .delete(authMiddleware, adminMiddleware, characterInventoryController.deleteCharacterInventory);

module.exports = router;
