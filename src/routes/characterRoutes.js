const express = require("express");

const characterController = require("../controllers/characterController");
const rankGateController = require("../controllers/rankGateController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const {
  exigirDonoDoPersonagem,
  exigirDonoOuAdmin,
  exigirProprioUsuarioOuAdmin,
} = require("../middlewares/ownershipMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

router
  .route("/")
  .post(authMiddleware, characterController.createCharacter)
  // Lista TODOS os personagens com dados completos (dinheiro, vida,
  // mana, XP, equipamento) — nunca foi usado pelo frontend do jogador,
  // só faz sentido como ferramenta de admin/suporte.
  .get(authMiddleware, adminMiddleware, characterController.getAllCharacters);

// Precisa vir antes de "/:id" — senão o Express casa "me" com o
// parâmetro :id e tenta buscar um personagem literalmente chamado "me".
router.route("/me").get(authMiddleware, carregarPersonagemAtual, characterController.getMeuPersonagem);

// Precisa vir antes de "/:id" pelo mesmo motivo — senão "/:id/public"
// nunca seria alcançado, "/:id" já teria casado primeiro.
router.route("/:id/public").get(authMiddleware, characterController.getCharacterPublico);

// Também precisa vir antes de "/:id" pelo mesmo motivo.
router
  .route("/:id/powers")
  .get(authMiddleware, exigirDonoOuAdmin("id"), characterController.getPoderesDisponiveis);

// Árvore de evoluções (ver comentário em characterController.getEvolucoesDisponiveis)
// — ainda sem tela pública, mas a API já fica pronta e protegida do
// mesmo jeito que o resto: leitura é dono-ou-admin, compra é só dono.
router
  .route("/:id/evolutions")
  .get(authMiddleware, exigirDonoOuAdmin("id"), characterController.getEvolucoesDisponiveis);

router
  .route("/:id/evolutions/:evolutionId/purchase")
  .post(authMiddleware, exigirDonoDoPersonagem("id"), characterController.comprarEvolucao);

// Portal de Ranque — chefe fixo do ranque atual, vencer promove pro
// próximo da escada (ver rankService.js/rankGateController.js).
router
  .route("/:id/rank-gate")
  .get(authMiddleware, exigirDonoOuAdmin("id"), rankGateController.getPortalAtual);

router
  .route("/:id/rank-gate/attempt")
  .post(authMiddleware, exigirDonoDoPersonagem("id"), rankGateController.tentarPortal);

router
  .route("/:id")
  // Dados COMPLETOS de um personagem (dinheiro, vida, mana, XP,
  // equipamento) — só o dono ou um admin pode ver. Qualquer outro
  // jogador usa GET /:id/public acima.
  .get(authMiddleware, exigirDonoOuAdmin("id"), characterController.getCharacterById)
  .patch(authMiddleware, exigirDonoDoPersonagem("id"), characterController.updateCharacter)
  .delete(authMiddleware, exigirDonoDoPersonagem("id"), characterController.deleteCharacter);

router
  .route("/my-character/:id")
  .get(authMiddleware, exigirDonoOuAdmin("id"), characterController.getCharacterById);

router
  .route("/by-user/:userId")
  .get(authMiddleware, exigirProprioUsuarioOuAdmin("userId"), characterController.getCharacterByUserId);

module.exports = router;
