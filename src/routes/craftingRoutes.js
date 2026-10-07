// src/routes/craftingRoutes.js
const express = require("express");
const craftingController = require("../controllers/craftingController");
const forgeController = require("../controllers/forgeController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const automation = require("../antiAutomation/httpMiddleware").protect("crafting");

const router = express.Router();

// Forja v2 (mantida — spec Forja v3 §52: "pode preservar /api/crafting
// pra não quebrar frontend/proxy existente"). Nada aqui usa mais estes
// endpoints depois da migração do front pra v3, mas ficam intactos.
router.get("/recipes", authMiddleware, carregarPersonagemAtual, automation, craftingController.getReceitas);
router.get("/queue", authMiddleware, carregarPersonagemAtual, automation, craftingController.getFila);
router.post("/start", authMiddleware, carregarPersonagemAtual, automation, craftingController.iniciarForja);
router.post("/collect", authMiddleware, carregarPersonagemAtual, automation, craftingController.coletarForja);

// Forja v3 — progressão própria, Fundição, Fabricação (blueprints) e
// Refinamento, todos server-authoritative (spec §53/§54).
router.get("/progress", authMiddleware, carregarPersonagemAtual, automation, forgeController.getProgresso);
router.get("/smelting", authMiddleware, carregarPersonagemAtual, automation, forgeController.getSmelting);
router.post("/smelt", authMiddleware, carregarPersonagemAtual, automation, forgeController.postSmelt);
router.get("/blueprints/summary", authMiddleware, carregarPersonagemAtual, automation, forgeController.getBlueprintsSummary);
router.get("/blueprints", authMiddleware, carregarPersonagemAtual, automation, forgeController.getBlueprints);
router.post("/craft", authMiddleware, carregarPersonagemAtual, automation, forgeController.postCraft);
router.get("/instances", authMiddleware, carregarPersonagemAtual, automation, forgeController.getInstances);
router.post("/instances/:id/equip", authMiddleware, carregarPersonagemAtual, automation, forgeController.postEquipInstance);
router.get("/scrolls", authMiddleware, carregarPersonagemAtual, automation, forgeController.getScrolls);
router.get("/refine/preview", authMiddleware, carregarPersonagemAtual, automation, forgeController.getRefinePreview);
router.post("/refine", authMiddleware, carregarPersonagemAtual, automation, forgeController.postRefine);
router.get("/forge-queue", authMiddleware, carregarPersonagemAtual, automation, forgeController.getForgeQueue);
router.post("/forge-collect", authMiddleware, carregarPersonagemAtual, automation, forgeController.postForgeCollect);

// Profissão de Ferreiro §12 — Livro de Receitas e Habilidades de
// Ferreiro. "/recipe-book" porque "/recipes" já é da Forja v2 legada
// acima.
router.get("/recipe-book", authMiddleware, carregarPersonagemAtual, automation, forgeController.getRecipeBook);
router.post("/recipe-book/:itemId/learn", authMiddleware, carregarPersonagemAtual, automation, forgeController.postLearnRecipe);
router.get("/blacksmith/stats", authMiddleware, carregarPersonagemAtual, automation, forgeController.getBlacksmithStats);
router.get("/chance-preview", authMiddleware, carregarPersonagemAtual, automation, forgeController.getChancePreview);
router.get("/tools", authMiddleware, carregarPersonagemAtual, automation, forgeController.getTools);
router.post("/tools/:instanceId/equip", authMiddleware, carregarPersonagemAtual, automation, forgeController.postEquipTool);
router.post("/tools/:slot/unequip", authMiddleware, carregarPersonagemAtual, automation, forgeController.postUnequipTool);

module.exports = router;
