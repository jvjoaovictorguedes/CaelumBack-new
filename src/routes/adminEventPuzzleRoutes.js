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

module.exports = router;
