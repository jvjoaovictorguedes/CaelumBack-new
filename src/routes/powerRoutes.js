// src/routes/powerRoutes.js
const express = require("express");
const powerController = require("../controllers/powerController");

const router = express.Router();

// Rotas para Poderes
router
  .route("/")
  .post(powerController.createPower) // POST para criar um novo poder, com validação
  .get(powerController.getAllPowers); // GET para obter todos os poderes

router
  .route("/:id")
  .get(powerController.getPowerById) // GET para obter um poder específico por ID
  .patch(powerController.updatePower) // PATCH para atualizar um poder, com validação
  .delete(powerController.deletePower); // DELETE para deletar um poder

module.exports = router;
