// src/routes/raceAbilitiesRoutes.js
const express = require("express");
const raceAbilitiesController = require("../controllers/raceAbilitiesController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");

const router = express.Router();

router
  .route("/")
  .post(authMiddleware, adminMiddleware, raceAbilitiesController.createRaceAbility)
  .get(raceAbilitiesController.getAllRaceAbilities);

router
  .route("/:id_raca/:id_power")
  .get(raceAbilitiesController.getRaceAbilityByRaceAndPowerId)
  .patch(authMiddleware, adminMiddleware, raceAbilitiesController.updateRaceAbility)
  .delete(authMiddleware, adminMiddleware, raceAbilitiesController.deleteRaceAbility);

module.exports = router;
