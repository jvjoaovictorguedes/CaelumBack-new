// src/routes/classAbilitiesRoutes.js
const express = require("express");
const classAbilitiesController = require("../controllers/classAbilitiesController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");

const router = express.Router();

router
  .route("/")
  .post(authMiddleware, adminMiddleware, classAbilitiesController.createClassAbility)
  .get(classAbilitiesController.getAllClassAbilities);

router
  .route("/:id_classe/:id_poder")
  .get(classAbilitiesController.getClassAbilityByClassAndPowerId)
  .patch(authMiddleware, adminMiddleware, classAbilitiesController.updateClassAbility)
  .delete(authMiddleware, adminMiddleware, classAbilitiesController.deleteClassAbility);

module.exports = router;
