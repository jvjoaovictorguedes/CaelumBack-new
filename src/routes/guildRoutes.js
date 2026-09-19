const express = require("express");
const guildController = require("../controllers/guildController");
const guildBossController = require("../controllers/guildBossController");
const guildMissionController = require("../controllers/guildMissionController");
const guildBenefitController = require("../controllers/guildBenefitController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");
const { exigirMembroDaGuild } = require("../middlewares/guildMembershipMiddleware");

const router = express.Router();

// authMiddleware + carregarPersonagemAtual em toda rota que age em nome
// de "meu personagem" — o controller usa req.personagemAtual.id em vez
// de confiar em id_personagem/idResponsavel/characterId vindo do corpo,
// query ou params (ver comentários no próprio controller).
router.get("/ranking", guildController.rankingGlobal);
router.get(
  "/character/:characterId",
  authMiddleware,
  carregarPersonagemAtual,
  guildController.buscarGuildDoPersonagem,
);
router.get(
  "/invites/character/:characterId",
  authMiddleware,
  carregarPersonagemAtual,
  guildController.listarConvitesDoPersonagem,
);
router.post(
  "/invites/:inviteId/respond",
  authMiddleware,
  carregarPersonagemAtual,
  guildController.responderConvite,
);

router
  .route("/")
  .post(authMiddleware, carregarPersonagemAtual, guildController.criarGuild)
  .get(guildController.listarGuilds);

router
  .route("/:id")
  .get(authMiddleware, carregarPersonagemAtual, guildController.buscarGuildPorId)
  .patch(authMiddleware, carregarPersonagemAtual, guildController.editarGuild)
  .delete(authMiddleware, carregarPersonagemAtual, guildController.dissolver);

router.post(
  "/:id/transfer-leadership",
  authMiddleware,
  carregarPersonagemAtual,
  guildController.transferirLideranca,
);

router.post("/:id/join", authMiddleware, carregarPersonagemAtual, guildController.entrarDireto);
router
  .route("/:id/invites")
  .post(authMiddleware, carregarPersonagemAtual, guildController.convidar)
  .get(
    authMiddleware,
    carregarPersonagemAtual,
    exigirMembroDaGuild("id"),
    guildController.listarConvitesDaGuild,
  );
router
  .route("/:id/applications")
  .post(authMiddleware, carregarPersonagemAtual, guildController.candidatar)
  .get(
    authMiddleware,
    carregarPersonagemAtual,
    exigirMembroDaGuild("id"),
    guildController.listarCandidaturas,
  );
router.post(
  "/:id/applications/:applicationId/respond",
  authMiddleware,
  carregarPersonagemAtual,
  guildController.responderCandidatura,
);

router.post("/:id/leave", authMiddleware, carregarPersonagemAtual, guildController.sair);
router.delete(
  "/:id/members/:characterId",
  authMiddleware,
  carregarPersonagemAtual,
  guildController.expulsar,
);
router.patch(
  "/:id/members/:characterId/role",
  authMiddleware,
  carregarPersonagemAtual,
  guildController.alterarCargo,
);

router
  .route("/:id/permissions")
  .get(
    authMiddleware,
    carregarPersonagemAtual,
    exigirMembroDaGuild("id"),
    guildController.listarPermissoes,
  )
  .patch(authMiddleware, carregarPersonagemAtual, guildController.atualizarPermissao);

router.post("/:id/donations", authMiddleware, carregarPersonagemAtual, guildController.doar);
router.get(
  "/:id/treasury/transactions",
  authMiddleware,
  carregarPersonagemAtual,
  exigirMembroDaGuild("id"),
  guildController.extratoTesouro,
);
router.post(
  "/:id/treasury/expenses",
  authMiddleware,
  carregarPersonagemAtual,
  guildController.registrarGasto,
);
router.get(
  "/:id/contributions",
  authMiddleware,
  carregarPersonagemAtual,
  exigirMembroDaGuild("id"),
  guildController.listarContribuicoes,
);

// Boss da Guilda (guildBossController.js/guildBossService.js) — só
// membro vê status/ataca; liberar é líder-only (checado dentro do
// service, §48 da spec: regra fixa nesta versão, não delega pra
// permissão customizável).
router.get(
  "/:id/boss",
  authMiddleware,
  carregarPersonagemAtual,
  exigirMembroDaGuild("id"),
  guildBossController.getStatus,
);
router.post("/:id/boss/liberar", authMiddleware, carregarPersonagemAtual, guildBossController.liberar);
router.post("/:id/boss/atacar", authMiddleware, carregarPersonagemAtual, guildBossController.atacar);

// Missões da Guilda (guildMissionController.js/guildMissionService.js)
// — automáticas, sem etapa de aceitar (§7).
router.get(
  "/:id/missions",
  authMiddleware,
  carregarPersonagemAtual,
  exigirMembroDaGuild("id"),
  guildMissionController.listar,
);

// Benefícios/Buffs (guildBenefitController.js/guildBuffService.js) —
// compra é líder-only (§25 da spec, mesma regra fixa do Boss).
router.get(
  "/:id/benefits",
  authMiddleware,
  carregarPersonagemAtual,
  exigirMembroDaGuild("id"),
  guildBenefitController.listar,
);
router.post(
  "/:id/benefits/:tipo/upgrade",
  authMiddleware,
  carregarPersonagemAtual,
  guildBenefitController.comprarNivel,
);

router.get(
  "/:id/logs",
  authMiddleware,
  carregarPersonagemAtual,
  exigirMembroDaGuild("id"),
  guildController.listarLogs,
);

module.exports = router;
