// Boss Global — rotas do jogador, montadas sob /api/world-boss.
const express = require("express");
const worldBossController = require("../controllers/worldBossController");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();
router.use(authMiddleware);

router.get("/status", worldBossController.obterStatus);

module.exports = router;
