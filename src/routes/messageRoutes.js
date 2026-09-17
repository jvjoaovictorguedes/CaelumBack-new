const express = require("express");
const messageController = require("../controllers/messageController");
const authMiddleware = require("../middlewares/authMiddleware");
const { criarLimitador } = require("../middlewares/rateLimitMiddleware");

const router = express.Router();

// Só autenticação não impedia um usuário de scriptar milhares de
// mensagens. Dois tetos por CONTA (não IP): rajada curta (5/5s) e
// sustentado (30/min) — o rate limiter atual é de janela única, então
// aplica os dois em cadeia.
const limitadorRajadaMensagens = criarLimitador({
  janelaMs: 5 * 1000,
  maxTentativas: 5,
  obterChave: (req) => `msg-rajada:${req.user.id}`,
});
const limitadorMensagensPorMinuto = criarLimitador({
  janelaMs: 60 * 1000,
  maxTentativas: 30,
  obterChave: (req) => `msg-minuto:${req.user.id}`,
});

router.post(
  "/",
  authMiddleware,
  limitadorRajadaMensagens,
  limitadorMensagensPorMinuto,
  messageController.sendMessage,
);
router.get("/unread-count/:userId", authMiddleware, messageController.getUnreadCount);
router.get("/inbox/:userId", authMiddleware, messageController.getInbox);
router.get(
  "/conversation/:userId/:otherUserId",
  authMiddleware,
  messageController.getConversation,
);

module.exports = router;
