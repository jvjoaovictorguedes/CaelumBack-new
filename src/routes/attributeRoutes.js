const express = require("express");

const attributeController = require("../controllers/attributeController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

router.post("/:id", authMiddleware, carregarPersonagemAtual, attributeController.distribuir);

router.post(
  "/:id/random",
  authMiddleware,
  carregarPersonagemAtual,
  attributeController.distribuirAleatoriamente,
);

module.exports = router;
