// Painel Administrativo — Boss Global — montada sob
// /api/admin/world-boss. Catálogo exige worldboss.manage; operação do
// ciclo atual (/current/*) exige events.manage — mesmas duas
// permissões já usadas pelo resto do painel pra essa distinção
// (conteúdo vs eventos ao vivo). Cada bloco é seu PRÓPRIO sub-router
// com seu próprio requireAdminPermission — nunca um `router.use`
// único no topo, que aplicaria a MESMA permissão a /current/* também.
const express = require("express");
const adminWorldBossController = require("../controllers/adminWorldBossController");
const adminWorldBossEventController = require("../controllers/adminWorldBossEventController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();
router.use(authMiddleware, adminMiddleware);

const catalogo = express.Router();
catalogo.use(requireAdminPermission("worldboss.manage"));
catalogo.get("/configs", adminWorldBossController.listar);
catalogo.get("/configs/:id", adminWorldBossController.obter);
catalogo.post("/configs", adminWorldBossController.criar);
catalogo.patch("/configs/:id", adminWorldBossController.atualizar);
catalogo.post("/configs/:id/duplicate", adminWorldBossController.duplicar);
catalogo.post("/configs/:id/deactivate", adminWorldBossController.desativar);
catalogo.post("/configs/:id/reactivate", adminWorldBossController.reativar);
catalogo.get("/settings", adminWorldBossController.obterConfiguracoes);
catalogo.patch("/settings", adminWorldBossController.atualizarConfiguracoes);
catalogo.get("/metrics", adminWorldBossController.metricas);
router.use("/", catalogo);

const eventoAtual = express.Router();
eventoAtual.use(requireAdminPermission("events.manage"));
eventoAtual.get("/status", adminWorldBossEventController.status);
eventoAtual.post("/force-discovery", adminWorldBossEventController.forcarDescoberta);
eventoAtual.post("/awaken", adminWorldBossEventController.despertarManualmente);
eventoAtual.post("/cancel", adminWorldBossEventController.cancelarCicloAtual);
router.use("/current", eventoAtual);

module.exports = router;
