// src/routes/characterRoutes.js
const express = require("express");
const characterController = require("../controllers/characterController");

const router = express.Router();

// Rotas para Personagens
router
  .route("/")
  .post(characterController.createCharacter)
  .get(characterController.getAllCharacters);

router
  .route("/:id")
  .get(characterController.getCharacterById)
  .patch(characterController.updateCharacter)
  .delete(characterController.deleteCharacter);

router.route("/my-character/:id").get(characterController.getCharacterById);

// Busca o personagem pertencente a um usuário (usado no login e no dashboard)
router
  .route("/by-user/:userId")
  .get(characterController.getCharacterByUserId);

module.exports = router;
