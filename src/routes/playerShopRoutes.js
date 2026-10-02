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

router
  .route("/mine/demands")
  .post(authMiddleware, carregarPersonagemAtual, playerShopController.criarDemanda)
  .get(authMiddleware, carregarPersonagemAtual, playerShopController.listarMinhasDemandas);

// Demandas são globais (qualquer personagem pode ver/entregar), por isso
// vivem fora de "/mine" — mas ainda precisam vir antes de "/:characterId".
router.get("/demands", authMiddleware, playerShopController.listarDemandasAbertas);
router.post(
  "/demands/:idDemanda/cancel",
  authMiddleware,
  carregarPersonagemAtual,
  playerShopController.cancelarDemanda,
);
router.post(
  "/demands/:idDemanda/deliver",
  authMiddleware,
  carregarPersonagemAtual,
  playerShopController.entregarNaDemanda,
);

router.get("/mine/commissions", authMiddleware, carregarPersonagemAtual, playerShopController.listarMinhasEncomendas);

// Encomendas também vivem fora de "/mine" (precisam vir antes de
// "/:characterId") — cada uma pertence a um cliente+lojista específicos,
// validado dentro do service (playerShopCommissionService).
router.get("/commissions/:idEncomenda", authMiddleware, carregarPersonagemAtual, playerShopController.obterEncomenda);
router.post(
  "/commissions/:idEncomenda/counter-offer",
  authMiddleware,
  carregarPersonagemAtual,
  playerShopController.contraProporEncomenda,
);
router.post(
  "/commissions/:idEncomenda/accept",
  authMiddleware,
  carregarPersonagemAtual,
  playerShopController.aceitarEncomenda,
);
router.post(
  "/commissions/:idEncomenda/decline",
  authMiddleware,
  carregarPersonagemAtual,
  playerShopController.recusarEncomenda,
);
router.post(
  "/commissions/:idEncomenda/deliver",
  authMiddleware,
  carregarPersonagemAtual,
  playerShopController.entregarEncomenda,
);
router.post(
  "/commissions/:idEncomenda/cancel",
  authMiddleware,
  carregarPersonagemAtual,
  playerShopController.cancelarEncomenda,
);

router.get("/:characterId", authMiddleware, playerShopController.obterLoja);

// Precisa vir DEPOIS de "/:characterId" por design: cria uma encomenda
// PARA o personagem dono de :characterId (o cliente é quem está
// autenticado, não quem está na URL).
router.post(
  "/:characterId/commissions",
  authMiddleware,
  carregarPersonagemAtual,
  playerShopController.criarEncomenda,
);

module.exports = router;
