// src/routes/combatRoutes.js
const express = require("express");
const combatController = require("../controllers/combatController");

const router = express.Router();

router.get("/enemy/:characterId", combatController.gerarInimigoParaPersonagem);
router.post("/action", combatController.executarTurno);

module.exports = router;
