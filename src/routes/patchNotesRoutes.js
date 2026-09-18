// src/routes/patchNotesRoutes.js
const express = require("express");
const patchNotesController = require("../controllers/patchNotesController");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();

// Sem carregarPersonagemAtual — patch notes são por CONTA, não por
// personagem (o mesmo jogador com 2 personagens vê a mesma lista).
router.get("/", authMiddleware, patchNotesController.getPatchNotes);
router.post("/mark-seen", authMiddleware, patchNotesController.marcarComoVisto);

module.exports = router;
