// src/routes/itemRoutes.js
const express = require("express");
const itemController = require("../controllers/itemsController");

const router = express.Router();

// Rotas para Itens
router
  .route("/")
  .post(itemController.createItem) // POST para criar um novo item, com validação
  .get(itemController.getAllItems); // GET para obter todos os itens

router
  .route("/:id")
  .get(itemController.getItemById) // GET para obter um item específico por ID
  .patch(itemController.updateItem) // PATCH para atualizar um item, com validação
  .delete(itemController.deleteItem); // DELETE para deletar um item

module.exports = router;
