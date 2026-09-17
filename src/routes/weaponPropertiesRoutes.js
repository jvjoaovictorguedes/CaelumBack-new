// src/routes/weaponPropertiesRoutes.js
const express = require("express");
const weaponPropertiesController = require("../controllers/weaponPropertiesController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");

const router = express.Router();

router
  .route("/")
  .post(authMiddleware, adminMiddleware, weaponPropertiesController.createWeaponProperties)
  .get(weaponPropertiesController.getAllWeaponProperties);

router
  .route("/:id_item")
  .get(weaponPropertiesController.getWeaponPropertiesById)
  .patch(authMiddleware, adminMiddleware, weaponPropertiesController.updateWeaponProperties)
  .delete(authMiddleware, adminMiddleware, weaponPropertiesController.deleteWeaponProperties);

module.exports = router;
