// Rotas PÚBLICAS de música (§11.1) — montadas em /api/music, sem
// authMiddleware (qualquer tela do jogo precisa carregar isso).
const express = require("express");
const musicController = require("../controllers/musicController");

const router = express.Router();

router.get("/config", musicController.obterConfig);
router.get("/tracks/:key/audio", musicController.servirAudio);

module.exports = router;
