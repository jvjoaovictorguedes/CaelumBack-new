// src/routes/armorPropertiesRoutes.js
const express = require("express");
const armorPropertiesController = require("../controllers/armorPropertiesController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const router = express.Router();

router
  .route("/")
  .post(authMiddleware, adminMiddleware, armorPropertiesController.createArmorProperties)
  .get(armorPropertiesController.getAllArmorProperties);

router
  .route("/:id_item")
  .get(armorPropertiesController.getArmorPropertiesById)
  .patch(authMiddleware, adminMiddleware, armorPropertiesController.updateArmorProperties)
  .delete(authMiddleware, adminMiddleware, armorPropertiesController.deleteArmorProperties);

module.exports = router;
