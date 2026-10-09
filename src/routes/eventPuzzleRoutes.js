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
// Fase 12 — salas (blueprints) públicas de uma edição, com layout
// pras desbloqueadas (nunca a golden solution, ver dtoPublicoLayout).
router.get("/:editionId/blueprints", authMiddleware, carregarPersonagemAtual, controller.listarBlueprintsPublicos);
// Fase 9 — Caderno de Investigação (leitura; nunca cria/desbloqueia
// nada — isso só acontece dentro do pipeline de ações, Fase 8).
router.get("/:editionId/clues", authMiddleware, carregarPersonagemAtual, controller.obterCaderno);
// Fase 11 — Hall das Lendas (leitura pública do evento, nunca gated por
// personagem — mesma proteção de auth básica das outras rotas, mas o
// conteúdo em si não depende de quem está logado).
router.get("/:editionId/legends", authMiddleware, carregarPersonagemAtual, controller.obterHallDasLendas);
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
// Fase 12 — abandono voluntário; mesma proteção Anti-Automação das
// outras mutações desta API.
router.post(
  "/puzzle-instances/:id/abandon",
  authMiddleware,
  carregarPersonagemAtual,
  automation,
  controller.abandonarInstancia,
);

module.exports = router;
