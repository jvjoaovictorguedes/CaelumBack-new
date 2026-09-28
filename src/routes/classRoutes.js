// src/routes/classRoutes.js
const express = require("express");
const classController = require("../controllers/classController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const { criarLimitador } = require("../middlewares/rateLimitMiddleware");

const router = express.Router();

// Mesmo raciocínio de raceRoutes.js — a proteção de verdade é
// class_rare_won ficar travado no banco na primeira chamada, esse limite
// é só segunda camada. Ver comentário completo em raceRoutes.js (o
// limite de 5/hora estava derrubando jogadores legítimos que só
// tentaram de novo depois de uma falha de rede/timeout).
const limitadorSorteioRaro = criarLimitador({
  janelaMs: 60 * 60 * 1000,
  maxTentativas: 30,
  obterChave: (req) => `classe-rara:${req.user.id}`,
});

router
  .route("/")
  .post(authMiddleware, adminMiddleware, classController.createClass)
  .get(classController.getAllClasses);

// Precisa vir antes de "/:id" — senão o Express casa "sortear-raro" com
// o parâmetro :id.
router.post("/sortear-raro", authMiddleware, limitadorSorteioRaro, classController.sortearClasseRara);

// Precisa vir antes de "/:id" pelo mesmo motivo de "/sortear-raro" —
// pública (sem authMiddleware) porque é usada na tela de criação de
// personagem, antes de existir sessão de personagem.
router.get("/:id/evolution-paths", classController.getEvolutionPathsPreview);

router
  .route("/:id")
  .get(classController.getClassById)
  .patch(authMiddleware, adminMiddleware, classController.updateClass)
  .delete(authMiddleware, adminMiddleware, classController.deleteClass);

module.exports = router;
