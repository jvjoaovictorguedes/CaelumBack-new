const express = require("express");

const characterController = require("../controllers/characterController");
const authMiddleware = require("../middlewares/authMiddleware");
const { exigirDonoDoPersonagem } = require("../middlewares/ownershipMiddleware");

const router = express.Router();

router
  .route("/")
  .post(authMiddleware, characterController.createCharacter)
  .get(authMiddleware, characterController.getAllCharacters);

router
  .route("/:id")
  .get(authMiddleware, characterController.getCharacterById)
  .patch(authMiddleware, exigirDonoDoPersonagem("id"), characterController.updateCharacter)
  .delete(authMiddleware, exigirDonoDoPersonagem("id"), characterController.deleteCharacter);

router.route("/my-character/:id").get(authMiddleware, characterController.getCharacterById);

router.route("/by-user/:userId").get(authMiddleware, characterController.getCharacterByUserId);

module.exports = router;
