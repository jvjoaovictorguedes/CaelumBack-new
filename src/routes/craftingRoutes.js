// src/routes/craftingRoutes.js
const express = require("express");
const craftingController = require("../controllers/craftingController");
const forgeController = require("../controllers/forgeController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

// Forja v2 (mantida — spec Forja v3 §52: "pode preservar /api/crafting
// pra não quebrar frontend/proxy existente"). Nada aqui usa mais estes
// endpoints depois da migração do front pra v3, mas ficam intactos.
router.get("/recipes", authMiddleware, carregarPersonagemAtual, craftingController.getReceitas);
router.get("/queue", authMiddleware, carregarPersonagemAtual, craftingController.getFila);
router.post("/start", authMiddleware, carregarPersonagemAtual, craftingController.iniciarForja);
router.post("/collect", authMiddleware, carregarPersonagemAtual, craftingController.coletarForja);

// Forja v3 — progressão própria, Fundição, Fabricação (blueprints) e
// Refinamento, todos server-authoritative (spec §53/§54).
router.get("/progress", authMiddleware, carregarPersonagemAtual, forgeController.getProgresso);
router.get("/smelting", authMiddleware, carregarPersonagemAtual, forgeController.getSmelting);
router.post("/smelt", authMiddleware, carregarPersonagemAtual, forgeController.postSmelt);
router.get("/blueprints", authMiddleware, carregarPersonagemAtual, forgeController.getBlueprints);
router.post("/craft", authMiddleware, carregarPersonagemAtual, forgeController.postCraft);
router.get("/instances", authMiddleware, carregarPersonagemAtual, forgeController.getInstances);
router.post("/instances/:id/equip", authMiddleware, carregarPersonagemAtual, forgeController.postEquipInstance);
router.get("/scrolls", authMiddleware, carregarPersonagemAtual, forgeController.getScrolls);
router.get("/refine/preview", authMiddleware, carregarPersonagemAtual, forgeController.getRefinePreview);
router.post("/refine", authMiddleware, carregarPersonagemAtual, forgeController.postRefine);
router.get("/forge-queue", authMiddleware, carregarPersonagemAtual, forgeController.getForgeQueue);
router.post("/forge-collect", authMiddleware, carregarPersonagemAtual, forgeController.postForgeCollect);

module.exports = router;
