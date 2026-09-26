// Painel Administrativo Fase 8 (§19) — montada sob /api/admin/adventure.
const express = require("express");
const adminAdventureController = require("../controllers/adminAdventureController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");
const { criarLimitador } = require("../middlewares/rateLimitMiddleware");
const { SIMULACAO_RATE_LIMIT_JANELA_MS, SIMULACAO_RATE_LIMIT_MAX_TENTATIVAS } = require("../config/monsterBalanceConfig");

const router = express.Router();

router.use(authMiddleware, adminMiddleware, requireAdminPermission("adventure.manage"));

// Editor de Balanceamento de Monstros por Resultado §13 — rate limit
// por CONTA de admin (nunca por IP: dois admins atrás do mesmo
// escritório não devem dividir o mesmo limite). Só a simulação (custo
// de CPU real, até 1.000 combates) precisa disso; preview é barato.
const limitadorSimulacaoBalanceamento = criarLimitador({
  janelaMs: SIMULACAO_RATE_LIMIT_JANELA_MS,
  maxTentativas: SIMULACAO_RATE_LIMIT_MAX_TENTATIVAS,
  obterChave: (req) => `balance-simulate:${req.user.id}`,
});

router.get("/zones", adminAdventureController.listarZonas);
router.post("/zones", adminAdventureController.criarZona);
router.patch("/zones/:id", adminAdventureController.atualizarZona);

router.get("/monsters", adminAdventureController.listarMonstros);
router.post("/monsters", adminAdventureController.criarMonstro);
router.patch("/monsters/:id", adminAdventureController.atualizarMonstro);
router.post("/monsters/:id/duplicate", adminAdventureController.duplicarMonstro);
router.get("/monsters/balance-presets", adminAdventureController.listarPresetsBalanceamento);
router.post("/monsters/:id/balance-preview", adminAdventureController.previewBalanceamento);
router.post("/monsters/:id/balance-simulate", limitadorSimulacaoBalanceamento, adminAdventureController.simularBalanceamento);

router.get("/zone-monsters", adminAdventureController.listarAparicoes);
router.post("/zone-monsters", adminAdventureController.criarAparicao);
router.patch("/zone-monsters/:id", adminAdventureController.atualizarAparicao);

router.get("/loot", adminAdventureController.listarLoot);
router.post("/loot", adminAdventureController.criarLoot);
router.patch("/loot/:id", adminAdventureController.atualizarLoot);

module.exports = router;
