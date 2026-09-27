// Painel Administrativo de Expedição — montada sob /api/admin/expedition.
// Uma tela só que cobre o balanceamento de Expedição (tempo/drops/
// progressão + a Emboscada que mora dentro dela), Aventura (perigo) e
// Aventura em Grupo (escala/limites), pedido explícito do jogador de
// juntar essas 3 telas de balanceamento num painel só.
const express = require("express");
const adminExpeditionController = require("../controllers/adminExpeditionController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();
router.use(authMiddleware, adminMiddleware);

const podeBalancear = requireAdminPermission("expedition.balance");

router.get("/balance", podeBalancear, adminExpeditionController.obterBalanceamento);
router.put("/balance/:group", podeBalancear, adminExpeditionController.atualizarBalanceamento);

module.exports = router;
