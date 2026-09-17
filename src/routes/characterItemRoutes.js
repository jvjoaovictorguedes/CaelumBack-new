const express = require("express");
const characterInventoryController = require("../controllers/characterInventoryController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

router
  .route("/use")
  .post(authMiddleware, carregarPersonagemAtual, characterInventoryController.useItem);

module.exports = router;
