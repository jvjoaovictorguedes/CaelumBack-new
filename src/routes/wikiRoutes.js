// src/routes/wikiRoutes.js — Wiki do Jogo, leitura pública (qualquer
// jogador logado, sem exigir personagem). Montada sob /api/wiki.
const express = require("express");
const wikiController = require("../controllers/wikiController");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/", authMiddleware, wikiController.listarArtigos);
router.get("/encyclopedia", authMiddleware, require("../middlewares/currentCharacterMiddleware").carregarPersonagemAtual, async (req, res) => {
  try {
    const artigos = await require("../services/wikiEncyclopediaService").getEncyclopedia(req.personagemAtual.id);
    res.json({ status: "success", data: { artigos } });
  } catch (error) {
    console.error("Erro ao carregar enciclopédia:", error.name);
    res.status(500).json({ message: "Não foi possível carregar a enciclopédia." });
  }
});
router.get("/:slug", authMiddleware, wikiController.obterArtigo);

module.exports = router;
