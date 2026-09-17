// src/routes/powerRoutes.js
const express = require("express");
const powerController = require("../controllers/powerController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");

const router = express.Router();

router
  .route("/")
  .post(authMiddleware, adminMiddleware, powerController.createPower)
  .get(powerController.getAllPowers);

router
  .route("/:id")
  .get(powerController.getPowerById)
  .patch(authMiddleware, adminMiddleware, powerController.updatePower)
  .delete(authMiddleware, adminMiddleware, powerController.deletePower);

module.exports = router;
