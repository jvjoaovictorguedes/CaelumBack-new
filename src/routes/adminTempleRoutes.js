// Painel Administrativo — Templo do Véu Celestial — montada sob
// /api/admin/temple. Permissão única temple.manage (§12 — diferente
// do Boss Global, aqui não existe catálogo reutilizável separado do
// evento vivo: a própria TempleEvent É o catálogo até ser ativada).
const express = require("express");
const adminTempleEventController = require("../controllers/adminTempleEventController");
const adminTempleMissionController = require("../controllers/adminTempleMissionController");
const adminTempleRelicaryController = require("../controllers/adminTempleRelicaryController");
const adminTempleBossController = require("../controllers/adminTempleBossController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();
router.use(authMiddleware, adminMiddleware, requireAdminPermission("temple.manage"));

router.get("/events", adminTempleEventController.listar);
router.get("/events/:id", adminTempleEventController.obter);
router.post("/events", adminTempleEventController.criar);
router.patch("/events/:id", adminTempleEventController.atualizar);
router.post("/events/:id/schedule", adminTempleEventController.agendar);
router.post("/events/:id/cancel", adminTempleEventController.cancelar);
router.post("/events/:id/duplicate", adminTempleEventController.duplicar);

router.get("/events/:idEvento/missions", adminTempleMissionController.listar);
router.post("/events/:idEvento/missions", adminTempleMissionController.criar);
router.patch("/events/:idEvento/missions/:idMissao", adminTempleMissionController.atualizar);
router.delete("/events/:idEvento/missions/:idMissao", adminTempleMissionController.excluir);
router.post("/events/:idEvento/missions/preview", adminTempleMissionController.preview);

router.get("/events/:idEvento/relicary", adminTempleRelicaryController.obter);
router.put("/events/:idEvento/relicary/pool", adminTempleRelicaryController.salvarPool);
router.post("/events/:idEvento/relicary/entries", adminTempleRelicaryController.criarEntry);
router.patch("/events/:idEvento/relicary/entries/:idEntry", adminTempleRelicaryController.atualizarEntry);
router.delete("/events/:idEvento/relicary/entries/:idEntry", adminTempleRelicaryController.excluirEntry);
router.get("/events/:idEvento/relicary/preview-odds", adminTempleRelicaryController.previewOdds);

router.get("/events/:idEvento/boss", adminTempleBossController.obter);
router.put("/events/:idEvento/boss/config", adminTempleBossController.salvarConfig);
router.post("/events/:idEvento/boss/phases", adminTempleBossController.criarFase);
router.patch("/events/:idEvento/boss/phases/:idFase", adminTempleBossController.atualizarFase);
router.delete("/events/:idEvento/boss/phases/:idFase", adminTempleBossController.excluirFase);
router.post("/events/:idEvento/boss/resistances", adminTempleBossController.criarResistencia);
router.patch("/events/:idEvento/boss/resistances/:idResistencia", adminTempleBossController.atualizarResistencia);
router.delete("/events/:idEvento/boss/resistances/:idResistencia", adminTempleBossController.excluirResistencia);
router.post("/events/:idEvento/boss/rewards", adminTempleBossController.criarRewardEntry);
router.patch("/events/:idEvento/boss/rewards/:idEntry", adminTempleBossController.atualizarRewardEntry);
router.delete("/events/:idEvento/boss/rewards/:idEntry", adminTempleBossController.excluirRewardEntry);
router.post("/events/:idEvento/boss/simulate", adminTempleBossController.simular);

module.exports = router;
