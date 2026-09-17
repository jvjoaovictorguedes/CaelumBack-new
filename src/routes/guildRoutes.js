const express = require("express");
const guildController = require("../controllers/guildController");

const router = express.Router();

router.get("/ranking", guildController.rankingGlobal);
router.get("/character/:characterId", guildController.buscarGuildDoPersonagem);
router.get("/invites/character/:characterId", guildController.listarConvitesDoPersonagem);
router.post("/invites/:inviteId/respond", guildController.responderConvite);

router.route("/").post(guildController.criarGuild).get(guildController.listarGuilds);
router.route("/:id").get(guildController.buscarGuildPorId).patch(guildController.editarGuild).delete(guildController.dissolver);

router.post("/:id/transfer-leadership", guildController.transferirLideranca);

router.post("/:id/join", guildController.entrarDireto);
router.route("/:id/invites").post(guildController.convidar).get(guildController.listarConvitesDaGuild);
router.route("/:id/applications").post(guildController.candidatar).get(guildController.listarCandidaturas);
router.post("/:id/applications/:applicationId/respond", guildController.responderCandidatura);

router.post("/:id/leave", guildController.sair);
router.delete("/:id/members/:characterId", guildController.expulsar);
router.patch("/:id/members/:characterId/role", guildController.alterarCargo);

router.route("/:id/permissions").get(guildController.listarPermissoes).patch(guildController.atualizarPermissao);

router.post("/:id/donations", guildController.doar);
router.get("/:id/treasury/transactions", guildController.extratoTesouro);
router.post("/:id/treasury/expenses", guildController.registrarGasto);
router.get("/:id/contributions", guildController.listarContribuicoes);

router.get("/:id/logs", guildController.listarLogs);

module.exports = router;
