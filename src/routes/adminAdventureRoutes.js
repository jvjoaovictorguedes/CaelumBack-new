// Painel Administrativo Fase 8 (§19) — montada sob /api/admin/adventure.
//
// Reformulação V2 dos Monstros — o antigo Editor de Balanceamento por
// Resultado (preview/simulate/presets, baseado em multiplicador_*) foi
// REMOVIDO daqui: monstro agora tem stats fixos e autorais
// (nivel/vida_maxima/dano_min/dano_max/agilidade/velocidade/
// xp_recompensa/ouro_recompensa), editados direto pelos campos abaixo.
//
// Simulador de Balanceamento (POST /balance/simulate) — roda N
// combates PvE de verdade (mesmas fórmulas/motor do jogo real, ver
// adventureBalanceSimulationService.js) entre um personagem e um
// monstro escolhidos, pra calibrar dificuldade sem precisar jogar de
// verdade. Três modos (body.modo): "zona" (Modo Aventura solo, default),
// "expedicao" (interrupção de monstro da coleta — GET /expedition-regions
// alimenta o dropdown de região) e "grupo" (Aventura em Party, N cópias
// do personagem vs 1 monstro escalado). Não simula Motor de Status/
// cooldown/buffs (V1) — ver comentário no topo do service pra escopo
// completo.
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
router.put("/zones/:id/monsters", adminAdventureController.sincronizarRosterZona);

router.get("/monsters", adminAdventureController.listarMonstros);
router.post("/monsters", adminAdventureController.criarMonstro);
router.get("/monsters/:id", adminAdventureController.detalheMonstro);
router.patch("/monsters/:id", adminAdventureController.atualizarMonstro);
router.post("/monsters/:id/duplicate", adminAdventureController.duplicarMonstro);
router.delete("/monsters/:id", adminAdventureController.excluirMonstro);
router.put("/monsters/:id/loot", adminAdventureController.sincronizarLootMonstro);

router.get("/zone-monsters", adminAdventureController.listarAparicoes);
router.post("/zone-monsters", adminAdventureController.criarAparicao);
router.patch("/zone-monsters/:id", adminAdventureController.atualizarAparicao);

router.get("/loot", adminAdventureController.listarLoot);
router.post("/loot", adminAdventureController.criarLoot);
router.patch("/loot/:id", adminAdventureController.atualizarLoot);
router.delete("/loot/:id", adminAdventureController.excluirLoot);

router.post("/balance/simulate", adminAdventureController.simularBalanceamento);
router.get("/expedition-regions", adminAdventureController.listarRegioesExpedicao);

module.exports = router;
