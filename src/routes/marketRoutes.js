const express = require("express");
const marketController = require("../controllers/marketController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

// Precisa vir antes de "/listings/:id" — senão "mine" seria lido como
// um :id.
router
  .route("/listings/mine")
  .get(authMiddleware, carregarPersonagemAtual, marketController.meusAnuncios);

router
  .route("/listings")
  .get(authMiddleware, marketController.listarAnuncios)
  .post(authMiddleware, carregarPersonagemAtual, marketController.criarAnuncio);

router.route("/listings/:id/buy").post(authMiddleware, carregarPersonagemAtual, marketController.comprarAnuncio);
router.route("/listings/:id").delete(authMiddleware, carregarPersonagemAtual, marketController.cancelarAnuncio);

module.exports = router;
