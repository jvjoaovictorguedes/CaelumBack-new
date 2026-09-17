// src/routes/consumablePropertiesRoutes.js
const express = require("express");
const consumablePropertiesController = require("../controllers/consumablePropertiesController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");

const router = express.Router();

router
  .route("/")
  .post(authMiddleware, adminMiddleware, consumablePropertiesController.createConsumableProperties)
  .get(consumablePropertiesController.getAllConsumableProperties);

router
  .route("/:id_item")
  .get(consumablePropertiesController.getConsumablePropertiesById)
  .patch(authMiddleware, adminMiddleware, consumablePropertiesController.updateConsumableProperties)
  .delete(authMiddleware, adminMiddleware, consumablePropertiesController.deleteConsumableProperties);

module.exports = router;
