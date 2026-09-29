// src/routes/wikiRoutes.js — Wiki do Jogo, leitura pública (qualquer
// jogador logado, sem exigir personagem). Montada sob /api/wiki.
const express = require("express");
const wikiController = require("../controllers/wikiController");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/", authMiddleware, wikiController.listarArtigos);
router.get("/:slug", authMiddleware, wikiController.obterArtigo);

module.exports = router;
