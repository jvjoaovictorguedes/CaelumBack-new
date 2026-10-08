// Evento "O Coração da Máquina Celestial" — Fase 1. Montada sob
// /api/events. Superfície mínima do jogador — criação de instância é
// protegida pelo Anti-Automação existente (httpMiddleware.protect),
// mesmo padrão já em produção pras outras 11 rotas sensíveis
// (expedition/combat/pvp/fishing/etc.) — nunca um segundo Action Guard.
const express = require("express");
const controller = require("../controllers/eventPuzzleController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");
const automation = require("../antiAutomation/httpMiddleware").protect("eventPuzzle");

const router = express.Router();

router.get("/active", authMiddleware, carregarPersonagemAtual, controller.listarEdicoesAtivas);
router.post(
  "/:editionId/instances",
  authMiddleware,
  carregarPersonagemAtual,
  automation,
  controller.criarOuObterInstancia,
);
router.get(
  "/puzzle-instances/:id",
  authMiddleware,
  carregarPersonagemAtual,
  controller.obterInstancia,
);

module.exports = router;
