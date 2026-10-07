const express = require("express");
const alchemyController = require("../controllers/alchemyController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const automation = require("../antiAutomation/httpMiddleware").protect("alchemy");

const router = express.Router();

router.get("/progress", authMiddleware, carregarPersonagemAtual, automation, alchemyController.getProgresso);
router.get("/recipes", authMiddleware, carregarPersonagemAtual, automation, alchemyController.getReceitas);
router.get("/recipes/:id", authMiddleware, carregarPersonagemAtual, automation, alchemyController.getReceita);
router.post("/recipes/:id/brew", authMiddleware, carregarPersonagemAtual, automation, alchemyController.postBrew);
router.post("/recipes/:id/learn", authMiddleware, carregarPersonagemAtual, automation, alchemyController.postAprender);
router.get("/discoveries", authMiddleware, carregarPersonagemAtual, automation, alchemyController.getDescobertas);

module.exports = router;
