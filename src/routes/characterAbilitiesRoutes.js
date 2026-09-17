// src/routes/characterAbilitiesRoutes.js
const express = require("express");
const characterAbilitiesController = require("../controllers/characterAbilitiesController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");

const router = express.Router();

// Conceder/editar/remover poder direto é administrativo — o jogo só
// aprende poder via concederPoderesIniciais (nível/classe/raça).
router
  .route("/")
  .post(authMiddleware, adminMiddleware, characterAbilitiesController.createCharacterAbility)
  .get(authMiddleware, characterAbilitiesController.getAllCharacterAbilities);

router
  .route("/:id")
  .get(authMiddleware, characterAbilitiesController.getCharacterAbilityById)
  .patch(authMiddleware, adminMiddleware, characterAbilitiesController.updateCharacterAbility)
  .delete(authMiddleware, adminMiddleware, characterAbilitiesController.deleteCharacterAbility);

// Ativar/desativar (equipar/desequipar) um poder já aprendido — dono do
// personagem, não precisa ser admin (ver validação de ownership dentro
// do controller).
router.patch("/:id/toggle", authMiddleware, characterAbilitiesController.toggleCharacterAbility);

module.exports = router;
