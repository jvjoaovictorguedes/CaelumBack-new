// Inventário v2 (§9) — visão unificada de stacks + instâncias + equipado.
const express = require("express");
const inventoryV2Controller = require("../controllers/inventoryV2Controller");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

router.get("/v2", authMiddleware, carregarPersonagemAtual, inventoryV2Controller.obterInventarioV2);

module.exports = router;
