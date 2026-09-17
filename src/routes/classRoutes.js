// src/routes/classRoutes.js
const express = require("express");
const classController = require("../controllers/classController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const { criarLimitador } = require("../middlewares/rateLimitMiddleware");

const router = express.Router();

// Mesmo raciocínio de raceRoutes.js — sem isso um script em loop
// "vencia" o sorteio de classe rara (0.01% de chance) em tempo viável.
const limitadorSorteioRaro = criarLimitador({
  janelaMs: 60 * 60 * 1000,
  maxTentativas: 5,
  obterChave: (req) => `classe-rara:${req.user.id}`,
});

router
  .route("/")
  .post(authMiddleware, adminMiddleware, classController.createClass)
  .get(classController.getAllClasses);

// Precisa vir antes de "/:id" — senão o Express casa "sortear-raro" com
// o parâmetro :id.
router.post("/sortear-raro", authMiddleware, limitadorSorteioRaro, classController.sortearClasseRara);

router
  .route("/:id")
  .get(classController.getClassById)
  .patch(authMiddleware, adminMiddleware, classController.updateClass)
  .delete(authMiddleware, adminMiddleware, classController.deleteClass);

module.exports = router;
