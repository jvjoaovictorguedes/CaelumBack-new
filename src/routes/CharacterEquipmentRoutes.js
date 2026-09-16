const express = require("express");
const characterEquipmentController = require("../controllers/CharacterEquipmentController");

const router = express.Router();

router.route("/equip").post(characterEquipmentController.equipItem);
router.route("/unequip").delete(characterEquipmentController.unequipItem);
router
  .route("/:characterId")
  .get(characterEquipmentController.getEquipmentByCharacter);

module.exports = router;
