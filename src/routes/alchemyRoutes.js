const express = require("express");
const alchemyController = require("../controllers/alchemyController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

router.get("/progress", authMiddleware, carregarPersonagemAtual, alchemyController.getProgresso);
router.get("/recipes", authMiddleware, carregarPersonagemAtual, alchemyController.getReceitas);
router.get("/recipes/:id", authMiddleware, carregarPersonagemAtual, alchemyController.getReceita);
router.post("/recipes/:id/brew", authMiddleware, carregarPersonagemAtual, alchemyController.postBrew);
router.get("/discoveries", authMiddleware, carregarPersonagemAtual, alchemyController.getDescobertas);

module.exports = router;
