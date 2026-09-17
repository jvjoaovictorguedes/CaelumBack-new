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

router
  .route("/:id")
  .get(itemController.getItemById)
  .patch(authMiddleware, adminMiddleware, itemController.updateItem)
  .delete(authMiddleware, adminMiddleware, itemController.deleteItem);

module.exports = router;
