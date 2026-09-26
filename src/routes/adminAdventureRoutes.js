// Painel Administrativo Fase 8 (§19) — montada sob /api/admin/adventure.
//
// Reformulação V2 dos Monstros — o antigo Editor de Balanceamento por
// Resultado (preview/simulate/presets, baseado em multiplicador_*) foi
// REMOVIDO daqui: monstro agora tem stats fixos e autorais
// (nivel/vida_maxima/dano_min/dano_max/agilidade/velocidade/
// xp_recompensa/ouro_recompensa), editados direto pelos campos abaixo.
// O Simulador de Balanceamento V2 (3 cenários A/B/C) é uma fase futura
// separada, ainda não construída.
const express = require("express");
const adminAdventureController = require("../controllers/adminAdventureController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();

router.use(authMiddleware, adminMiddleware, requireAdminPermission("adventure.manage"));

router.get("/zones", adminAdventureController.listarZonas);
router.post("/zones", adminAdventureController.criarZona);
router.patch("/zones/:id", adminAdventureController.atualizarZona);

router.get("/monsters", adminAdventureController.listarMonstros);
router.post("/monsters", adminAdventureController.criarMonstro);
router.patch("/monsters/:id", adminAdventureController.atualizarMonstro);
router.post("/monsters/:id/duplicate", adminAdventureController.duplicarMonstro);

router.get("/zone-monsters", adminAdventureController.listarAparicoes);
router.post("/zone-monsters", adminAdventureController.criarAparicao);
router.patch("/zone-monsters/:id", adminAdventureController.atualizarAparicao);

router.get("/loot", adminAdventureController.listarLoot);
router.post("/loot", adminAdventureController.criarLoot);
router.patch("/loot/:id", adminAdventureController.atualizarLoot);

module.exports = router;
