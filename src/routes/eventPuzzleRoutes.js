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
// Fase 9 — Caderno de Investigação (leitura; nunca cria/desbloqueia
// nada — isso só acontece dentro do pipeline de ações, Fase 8).
router.get("/:editionId/clues", authMiddleware, carregarPersonagemAtual, controller.obterCaderno);
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
// Fase 8 — mesma proteção da criação (mesmo `automation`/tag
// "eventPuzzle", nunca um segundo Action Guard); o actionType derivado
// pelo middleware já difere por rota (path entra na chave), então esta
// rota tem seu próprio rate-limit/challenge independente da de criação.
router.post(
  "/puzzle-instances/:id/actions",
  authMiddleware,
  carregarPersonagemAtual,
  automation,
  controller.executarAcao,
);

module.exports = router;
