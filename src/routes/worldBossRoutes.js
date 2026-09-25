// Boss Global — rotas do jogador, montadas sob /api/world-boss.
const express = require("express");
const worldBossController = require("../controllers/worldBossController");
const worldBossCombatController = require("../controllers/worldBossCombatController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();
router.use(authMiddleware);

router.get("/status", worldBossController.obterStatus);

router.use(carregarPersonagemAtual);
router.post("/join", worldBossCombatController.entrar);
router.post("/leave", worldBossCombatController.sair);
router.post("/action", worldBossCombatController.acao);

module.exports = router;
