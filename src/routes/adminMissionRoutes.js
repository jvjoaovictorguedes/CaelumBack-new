// Painel Administrativo Fase 9 — montada sob /api/admin/missions
// (permissão missions.manage: "Missões livres, Guilda dos Aventureiros,
// Missões de Guilda", já cadastrada na Fase 1).
const express = require("express");
const adminMissionController = require("../controllers/adminMissionController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();
router.use(authMiddleware, adminMiddleware, requireAdminPermission("missions.manage"));

router.get("/catalogs", adminMissionController.catalogos);

router.get("/free", adminMissionController.listarMissoesLivres);
router.post("/free", adminMissionController.criarMissaoLivre);
router.patch("/free/:id", adminMissionController.atualizarMissaoLivre);
router.post("/free/:id/duplicate", adminMissionController.duplicarMissaoLivre);

router.get("/adventurers-guild", adminMissionController.listarMissoesGuildaAventureiros);
router.post("/adventurers-guild", adminMissionController.criarMissaoGuildaAventureiros);
router.patch("/adventurers-guild/:id", adminMissionController.atualizarMissaoGuildaAventureiros);
router.post("/adventurers-guild/:id/duplicate", adminMissionController.duplicarMissaoGuildaAventureiros);
router.post("/adventurers-guild/:id/rewards", adminMissionController.adicionarRecompensaGuildaAventureiros);
router.delete("/adventurers-guild/rewards/:idRecompensa", adminMissionController.removerRecompensaGuildaAventureiros);

router.get("/guild", adminMissionController.listarMissoesGuilda);
router.post("/guild", adminMissionController.criarMissaoGuilda);
router.patch("/guild/:id", adminMissionController.atualizarMissaoGuilda);
router.post("/guild/:id/duplicate", adminMissionController.duplicarMissaoGuilda);

module.exports = router;
