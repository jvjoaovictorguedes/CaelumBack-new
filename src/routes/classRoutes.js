// src/routes/classRoutes.js
const express = require("express");
const classController = require("../controllers/classController");

const router = express.Router();

// Rotas para Classes
router
  .route("/")
  .post(classController.createClass) // POST para criar uma nova classe, com validação
  .get(classController.getAllClasses); // GET para obter todas as classes

router
  .route("/:id")
  .get(classController.getClassById) // GET para obter uma classe específica por ID
  .patch(classController.updateClass) // PATCH para atualizar uma classe, com validação
  .delete(classController.deleteClass); // DELETE para deletar uma classe

module.exports = router;
