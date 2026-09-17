// src/routes/characterInventoryRoutes.js
const express = require("express");
const characterInventoryController = require("../controllers/characterInventoryController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const { exigirDonoDoPersonagem } = require("../middlewares/ownershipMiddleware");

const router = express.Router();

// Conceder item diretamente (sem passar pela loja) é operação
// administrativa — nenhuma tela de jogador chama isso.
router
  .route("/")
  .post(authMiddleware, adminMiddleware, characterInventoryController.createCharacterInventory)
  .get(
    authMiddleware,
    exigirDonoDoPersonagem("characterId"),
    characterInventoryController.getAllCharacterInventory,
  );

router
  .route("/:id") // id aqui refere-se a id_personagem_inventario
  .get(authMiddleware, characterInventoryController.getCharacterInventoryById)
  .patch(authMiddleware, adminMiddleware, characterInventoryController.updateCharacterInventory)
  .delete(authMiddleware, adminMiddleware, characterInventoryController.deleteCharacterInventory);

module.exports = router;
