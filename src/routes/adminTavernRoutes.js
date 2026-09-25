// Painel Administrativo — Sistema de Taverna — montada sob
// /api/admin/tavern, permissão tavern.manage.
const express = require("express");
const adminTavernController = require("../controllers/adminTavernController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();
router.use(authMiddleware, adminMiddleware, requireAdminPermission("tavern.manage"));

router.get("/menu", adminTavernController.listarMenu);
router.post("/menu", adminTavernController.criarItemMenu);
router.patch("/menu/:id", adminTavernController.atualizarItemMenu);
router.post("/menu/:id/duplicate", adminTavernController.duplicarItemMenu);
router.post("/menu/:id/deactivate", adminTavernController.desativarItemMenu);
router.post("/menu/:id/reactivate", adminTavernController.reativarItemMenu);

router.get("/games", adminTavernController.listarJogos);
router.post("/games", adminTavernController.criarJogo);
router.patch("/games/:id", adminTavernController.atualizarJogo);
router.post("/games/:id/duplicate", adminTavernController.duplicarJogo);
router.post("/games/:id/deactivate", adminTavernController.desativarJogo);
router.post("/games/:id/reactivate", adminTavernController.reativarJogo);

router.get("/settings", adminTavernController.obterConfiguracoes);
router.patch("/settings", adminTavernController.atualizarConfiguracoes);

router.get("/metrics", adminTavernController.obterMetricas);

module.exports = router;
