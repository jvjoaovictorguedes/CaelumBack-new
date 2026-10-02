// Loja do Aventureiro V2 — montada sob /api/player-shops.
const express = require("express");
const playerShopController = require("../controllers/playerShopController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

router.get("/", authMiddleware, playerShopController.listarLojas);

// "/mine" precisa vir antes de "/:characterId" — senão "mine" seria
// lido como um characterId.
router
  .route("/mine")
  .get(authMiddleware, carregarPersonagemAtual, playerShopController.obterMinhaLoja)
  .put(authMiddleware, carregarPersonagemAtual, playerShopController.atualizarMinhaLoja);

router.post("/mine/listings", authMiddleware, carregarPersonagemAtual, playerShopController.criarProdutoDaLoja);

router.get("/:characterId", authMiddleware, playerShopController.obterLoja);

module.exports = router;
