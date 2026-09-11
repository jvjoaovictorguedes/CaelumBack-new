const express = require("express");
const characterController = require("../controllers/characterController");
const router = express.Router();

router
  .route("/")
  .post(characterController.createCharacter)
  .get(characterController.getAllCharacters);

router
  .route("/:id/experience")
  .post(characterController.addExperience);

router
  .route("/:id")
  .get(characterController.getCharacterById)
  .patch(characterController.updateCharacter)
  .delete(characterController.deleteCharacter);

router
  .route("/my-character/:id")
  .get(characterController.getCharacterById);

router
  .route("/by-user/:userId")
  .get(characterController.getCharacterByUserId);

module.exports = router;