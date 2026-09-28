const express = require("express");
const guildJournalController = require("../controllers/guildJournalController");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();

// Sem carregarPersonagemAtual — o Jornal é lido por CONTA, não por
// personagem (mesma lógica do patchNotesRoutes.js).
router.get("/", authMiddleware, guildJournalController.getGuildJournal);
router.post("/mark-seen", authMiddleware, guildJournalController.marcarComoVisto);

module.exports = router;
