// Evento "O Coração da Máquina Celestial" — Fase 1. Montada sob
// /api/admin/event-puzzles. Permissão própria do domínio
// (event_puzzle.view/manage) — nunca permissão de Guilda nem
// events.manage (já é do Buff Global). GET usa .view, mutações usam
// .manage — mesmo padrão de adminCombatTypingRoutes.js.
const express = require("express");
const controller = require("../controllers/adminEventPuzzleController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();

router.use(authMiddleware, adminMiddleware);

router.get("/definitions", requireAdminPermission("event_puzzle.view"), controller.listarDefinicoes);
router.post("/definitions", requireAdminPermission("event_puzzle.manage"), controller.criarDefinicao);
router.patch(
  "/definitions/:id",
  requireAdminPermission("event_puzzle.manage"),
  controller.transicionarDefinicao,
);

router.get(
  "/definitions/:id/editions",
  requireAdminPermission("event_puzzle.view"),
  controller.listarEdicoes,
);
router.post(
  "/definitions/:id/editions",
  requireAdminPermission("event_puzzle.manage"),
  controller.criarEdicao,
);
router.patch("/editions/:id", requireAdminPermission("event_puzzle.manage"), controller.transicionarEdicao);

router.get(
  "/definitions/:id/blueprints",
  requireAdminPermission("event_puzzle.view"),
  controller.listarBlueprints,
);
router.post(
  "/definitions/:id/blueprints",
  requireAdminPermission("event_puzzle.manage"),
  controller.criarBlueprint,
);

// Fase 15 — editar identidade do Blueprint (nome/descrição/ordem/
// pré-requisito; nunca o config, que é por Version).
router.patch(
  "/blueprints/:id",
  requireAdminPermission("event_puzzle.manage"),
  controller.atualizarBlueprint,
);

router.get(
  "/blueprints/:id/versions",
  requireAdminPermission("event_puzzle.view"),
  controller.listarVersoes,
);
router.post(
  "/blueprints/:id/versions",
  requireAdminPermission("event_puzzle.manage"),
  controller.criarVersao,
);
router.patch(
  "/blueprint-versions/:versionId",
  requireAdminPermission("event_puzzle.manage"),
  controller.atualizarVersao,
);
router.patch(
  "/blueprint-versions/:versionId/status",
  requireAdminPermission("event_puzzle.manage"),
  controller.transicionarVersao,
);
// Fase 15 — dry-run de solvabilidade (nunca um solver automático: o
// Admin submete a sequência candidata). Mesma permissão de manage —
// não é só leitura, grava solvability_signature/validated_at quando
// resolve.
router.post(
  "/blueprint-versions/:versionId/validate-solvability",
  requireAdminPermission("event_puzzle.manage"),
  controller.validarSolvabilidade,
);

// Fase 9 — Catálogo de pistas (uma por Blueprint, nunca por Version —
// ver eventPuzzleModels.js). Mesma permissão do resto do domínio.
router.get("/blueprints/:id/clues", requireAdminPermission("event_puzzle.view"), controller.listarPistas);
router.post("/blueprints/:id/clues", requireAdminPermission("event_puzzle.manage"), controller.criarPista);
router.patch("/clues/:id", requireAdminPermission("event_puzzle.manage"), controller.atualizarPista);
router.delete("/clues/:id", requireAdminPermission("event_puzzle.manage"), controller.excluirPista);

// Fase 10 — Marcos Pioneer (uma por Blueprint, mesma permissão).
router.get("/blueprints/:id/milestones", requireAdminPermission("event_puzzle.view"), controller.listarMarcos);
router.post("/blueprints/:id/milestones", requireAdminPermission("event_puzzle.manage"), controller.criarMarco);
router.patch("/milestones/:id", requireAdminPermission("event_puzzle.manage"), controller.atualizarMarco);
router.delete("/milestones/:id", requireAdminPermission("event_puzzle.manage"), controller.excluirMarco);

// Fase 14 — Recompensas temáticas (uma N por Blueprint, mesma permissão).
router.get("/blueprints/:id/rewards", requireAdminPermission("event_puzzle.view"), controller.listarRecompensas);
router.post("/blueprints/:id/rewards", requireAdminPermission("event_puzzle.manage"), controller.criarRecompensa);
router.patch("/rewards/:id", requireAdminPermission("event_puzzle.manage"), controller.atualizarRecompensa);
router.delete("/rewards/:id", requireAdminPermission("event_puzzle.manage"), controller.excluirRecompensa);

// Fase 13 — Custódio do Meridiano (um EventPuzzleBossConfig por
// EventDefinition, upsert; fases/resistências N por config). Mesma
// permissão do resto do domínio — nunca um domínio de permissão
// próprio só pro boss.
router.get("/definitions/:id/boss", requireAdminPermission("event_puzzle.view"), controller.obterBoss);
router.put("/definitions/:id/boss/config", requireAdminPermission("event_puzzle.manage"), controller.salvarBossConfig);
router.post("/definitions/:id/boss/phases", requireAdminPermission("event_puzzle.manage"), controller.criarBossFase);
router.patch("/definitions/:id/boss/phases/:idFase", requireAdminPermission("event_puzzle.manage"), controller.atualizarBossFase);
router.delete("/definitions/:id/boss/phases/:idFase", requireAdminPermission("event_puzzle.manage"), controller.excluirBossFase);
router.post("/definitions/:id/boss/resistances", requireAdminPermission("event_puzzle.manage"), controller.criarBossResistencia);
router.patch("/definitions/:id/boss/resistances/:idResistencia", requireAdminPermission("event_puzzle.manage"), controller.atualizarBossResistencia);
router.delete("/definitions/:id/boss/resistances/:idResistencia", requireAdminPermission("event_puzzle.manage"), controller.excluirBossResistencia);

module.exports = router;
