// src/routes/evolutionRoutes.js
const express = require("express");
const evolutionController = require("../controllers/evolutionController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");

const router = express.Router();

// Ler a lista "crua" de evoluções (fora do contexto de um personagem)
// também é admin-only por ora — a árvore que o jogador vê de verdade é
// GET /characters/:id/evolutions (characterRoutes.js), que já cruza com
// o progresso dele. Sem público ver isso ainda porque a feature está
// oculta no front (ver EvolutionsPanel.tsx).
router
  .route("/")
  .post(authMiddleware, adminMiddleware, evolutionController.createEvolution)
  .get(authMiddleware, adminMiddleware, evolutionController.getAllEvolutions);

router
  .route("/:id")
  .get(authMiddleware, adminMiddleware, evolutionController.getEvolutionById)
  .patch(authMiddleware, adminMiddleware, evolutionController.updateEvolution)
  .delete(authMiddleware, adminMiddleware, evolutionController.deleteEvolution);

module.exports = router;
