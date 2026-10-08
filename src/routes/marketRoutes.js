const express = require("express");
const marketController = require("../controllers/marketController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const automation = require("../antiAutomation/httpMiddleware").protect("market");

const router = express.Router();

// Precisa vir antes de "/listings/:id" — senão "mine" seria lido como
// um :id.
router.route("/config").get(authMiddleware, marketController.obterConfig);

router
  .route("/listings/mine")
  .get(authMiddleware, carregarPersonagemAtual, automation, marketController.meusAnuncios);

router
  .route("/listings")
  .get(authMiddleware, marketController.listarAnuncios)
  .post(authMiddleware, carregarPersonagemAtual, automation, marketController.criarAnuncio);

router.route("/listings/:id/buy").post(authMiddleware, carregarPersonagemAtual, automation, marketController.comprarAnuncio);
router
  .route("/listings/:id")
  .patch(authMiddleware, carregarPersonagemAtual, automation, marketController.editarPrecoAnuncio)
  .delete(authMiddleware, carregarPersonagemAtual, automation, marketController.cancelarAnuncio);

router.route("/price-history/:idItem").get(authMiddleware, marketController.historicoPreco);

module.exports = router;
