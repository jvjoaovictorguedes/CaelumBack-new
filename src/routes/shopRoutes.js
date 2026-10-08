const express = require("express");
const shopController = require("../controllers/shopController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const automation = require("../antiAutomation/httpMiddleware").protect("shop");

const router = express.Router();

router.route("/purchase").post(authMiddleware, carregarPersonagemAtual, automation, shopController.purchaseItem);

module.exports = router;
