// src/routes/adventureGuildRoutes.js
const express = require("express");
const controller = require("../controllers/adventureGuildController");
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

module.exports = router;
