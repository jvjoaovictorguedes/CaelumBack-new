// Templo do Véu Celestial — rotas do jogador, montadas sob /api/temple.
const express = require("express");
const templeController = require("../controllers/templeController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");
const automation = require("../antiAutomation/httpMiddleware").protect("temple");

const router = express.Router();
router.get('/availability', async(req,res,next)=>{try{res.set('Cache-Control','no-store');res.json({enabled:await require('../services/templeReleaseService').enabled()});}catch(e){next(e);}});
router.use(authMiddleware, carregarPersonagemAtual);
router.use(async(req,res,next)=>{try{await require('../services/templeReleaseService').requireEnabled();next();}catch(e){res.status(e.statusCode||503).json({message:'O Templo está indisponível.'});}});

router.get("/status", templeController.obterStatus);
router.get("/missions", templeController.listarMissoes);
router.get("/relicary", templeController.obterRelicario);
router.get("/relicary/history", templeController.listarHistoricoRelicario);
router.get("/boss/status", templeController.obterStatusDoBoss);

router.use(automation);
router.post("/missions/:key/deliver", templeController.entregarItem);
router.post("/missions/:key/claim", templeController.reclamarRecompensa);
router.post("/relicary/draw", templeController.sortearRelicario);

module.exports = router;
