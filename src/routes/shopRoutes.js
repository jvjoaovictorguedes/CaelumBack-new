const express = require("express");
const shopController = require("../controllers/shopController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

router.route("/purchase").post(authMiddleware, carregarPersonagemAtual, shopController.purchaseItem);

module.exports = router;
