const express = require("express");

const characterController = require("../controllers/characterController");
const characterProfileController = require("../controllers/characterProfileController");
const missionController = require("../controllers/missionController");
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

// Perfil de Jogador (Especificação Perfil de Jogador §37/§40) — "/me/profile"
// também precisa vir antes de "/:id/profile" pelo mesmo motivo do "/me"
// acima. GET não exige carregarPersonagemAtual (visitante sem
// personagem ainda pode ver o perfil de outro); PATCH exige, porque só
// o próprio personagem pode editar o próprio perfil.
router
  .route("/me/profile")
  .patch(authMiddleware, carregarPersonagemAtual, characterProfileController.atualizarPerfilProprio);

router.route("/:id/profile").get(authMiddleware, characterProfileController.getPerfil);

// Precisa vir antes de "/:id" pelo mesmo motivo — senão "/:id/public"
// nunca seria alcançado, "/:id" já teria casado primeiro.
router.route("/:id/public").get(authMiddleware, characterController.getCharacterPublico);

// Também precisa vir antes de "/:id" pelo mesmo motivo.
router
  .route("/:id/powers")
  .get(authMiddleware, exigirDonoOuAdmin("id"), characterController.getPoderesDisponiveis);

router
  .route("/:id/powers/:idPower/purchase")
  .post(authMiddleware, exigirDonoDoPersonagem("id"), characterController.comprarPoder);

// Árvore de evoluções (ver comentário em characterController.getEvolucoesDisponiveis)
// — ainda sem tela pública, mas a API já fica pronta e protegida do
// mesmo jeito que o resto: leitura é dono-ou-admin, compra é só dono.
router
  .route("/:id/evolutions")
  .get(authMiddleware, exigirDonoOuAdmin("id"), characterController.getEvolucoesDisponiveis);

router
  .route("/:id/evolutions/:evolutionId/purchase")
  .post(authMiddleware, exigirDonoDoPersonagem("id"), characterController.comprarEvolucao);

// Evolução de CLASSE — diferente da árvore de Evolution acima (aquela é
// por natureza mágica). Nível alto + Relíquia de Ascensão específica da
// classe (ver classEvolutionService.js), única e definitiva.
router
  .route("/:id/class-evolution")
  .get(authMiddleware, exigirDonoOuAdmin("id"), characterController.getEvolucaoDeClasse)
  .post(authMiddleware, exigirDonoDoPersonagem("id"), characterController.evolveClass);

// Missões diárias/únicas — catálogo fixo (ver seeder), progresso
// individual por personagem (ver missionService.js).
// Loadout de consumíveis pra aba Combate — ver
// characterController.definirSlotConsumivelCombate.
router
  .route("/:id/combat-loadout/items")
  .patch(authMiddleware, exigirDonoDoPersonagem("id"), characterController.definirSlotConsumivelCombate);

router
  .route("/:id/missions")
  .get(authMiddleware, exigirDonoOuAdmin("id"), missionController.getMissoes);

router
  .route("/:id/missions/:missionId/claim")
  .post(authMiddleware, exigirDonoDoPersonagem("id"), missionController.resgatarMissao);

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
