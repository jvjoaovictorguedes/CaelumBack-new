// src/routes/adventureGuildRoutes.js
const express = require("express");
const controller = require("../controllers/adventureGuildController");
const spoilController = require("../controllers/spoilCounterController");
const huntController = require("../controllers/adventureHuntController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();
router.use(authMiddleware, carregarPersonagemAtual);

router.get("/", controller.obterVisaoGeral);
router.get("/daily", controller.listarDiarias);
router.get("/weekly", controller.listarSemanais);
router.get("/monthly", controller.listarMensais);
router.get("/milestones", controller.listarMarcos);
router.post("/missions/:missionId/claim", controller.resgatarMissaoLivre);

router.get("/rank", controller.obterQuadroDeRank);
router.post("/rank/offers/:offerId/accept", controller.aceitarOfertaDeRank);
router.post("/contracts/:contractId/deliver", controller.entregarItensDoContrato);
router.post("/contracts/:contractId/claim", controller.resgatarContrato);

router.get("/trial", controller.obterProvacao);
router.post("/trial/start", controller.iniciarProvacaoDoRank);
router.post("/trial/fail", controller.falharProvacaoDoRank);

// Balcão de Espólios — deliberadamente dentro de /api/adventure-guild
// (não é a Guilda social de /dashboard/guilds, ver spec "Balcão de
// Espólios" §3 IMPORTANTE).
router.get("/spoils", spoilController.obterEspolios);
router.patch("/spoils/:itemId/preferences", spoilController.atualizarPreferenciaDeEspolio);
router.post("/spoils/sell", spoilController.venderEspoliosDoBalcao);
router.get("/spoils/sales", spoilController.obterHistoricoDeVendas);
router.get("/spoil-orders", spoilController.obterEncomendas);
router.post("/spoil-orders/:orderId/deliver", spoilController.entregarEncomendaDoBalcao);

// Caçadas — mesma casa (/api/adventure-guild), ver spec "Caçadas da
// Guilda dos Aventureiros" §24.
router.get("/hunt", huntController.obterEstadoDaCacada);
router.post("/hunt/:huntId/accept", huntController.aceitarCacada);
router.post("/hunt/:huntId/abandon", huntController.abandonarCacadaAtiva);

module.exports = router;
