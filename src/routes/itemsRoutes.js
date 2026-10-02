// src/routes/itemRoutes.js
const express = require("express");
const itemController = require("../controllers/itemsController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");

const router = express.Router();

router
  .route("/")
  .post(authMiddleware, adminMiddleware, itemController.createItem)
  .get(itemController.getAllItems);

// Precisa vir ANTES de "/:id" — senão o Express casaria "/search" como
// se fosse um :id literal "search".
router.get("/search", authMiddleware, itemController.buscarParaSelecao);

router
  .route("/:id")
  .get(itemController.getItemById)
  .patch(authMiddleware, adminMiddleware, itemController.updateItem)
  .delete(authMiddleware, adminMiddleware, itemController.deleteItem);

module.exports = router;
