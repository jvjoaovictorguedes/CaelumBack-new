const express = require("express");
const characterEquipmentController = require("../controllers/CharacterEquipmentController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

router.route("/equip").post(authMiddleware, carregarPersonagemAtual, characterEquipmentController.equipItem);
router
  .route("/unequip")
  .delete(authMiddleware, carregarPersonagemAtual, characterEquipmentController.unequipItem);
router
  .route("/:characterId")
  .get(authMiddleware, characterEquipmentController.getEquipmentByCharacter);

module.exports = router;
