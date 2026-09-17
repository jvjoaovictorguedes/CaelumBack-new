// src/routes/characterAbilitiesRoutes.js
const express = require("express");
const characterAbilitiesController = require("../controllers/characterAbilitiesController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");

const router = express.Router();

// Conceder/editar/remover poder direto é administrativo — o jogo só
// aprende poder via concederPoderesIniciais (nível/classe/raça); nenhuma
// tela de jogador chama esses endpoints, e um POST aberto aqui deixava
// dar qualquer poder pra qualquer personagem sem checar nível/classe.
// As leituras continuam abertas (usadas direto pelo front sem JWT).
router
  .route("/")
  .post(authMiddleware, adminMiddleware, characterAbilitiesController.createCharacterAbility)
  .get(characterAbilitiesController.getAllCharacterAbilities);

router
  .route("/:id")
  .get(characterAbilitiesController.getCharacterAbilityById)
  .patch(authMiddleware, adminMiddleware, characterAbilitiesController.updateCharacterAbility)
  .delete(authMiddleware, adminMiddleware, characterAbilitiesController.deleteCharacterAbility);

module.exports = router;
