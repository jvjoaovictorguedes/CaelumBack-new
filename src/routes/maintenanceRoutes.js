// Endpoint PÚBLICO (sem auth) — montada sob /api/maintenance. O
// frontend consulta isto antes/durante o carregamento pra decidir se
// mostra a tela de manutenção, mesmo pra visitante deslogado.
const express = require("express");
const adminMaintenanceController = require("../controllers/adminMaintenanceController");

const router = express.Router();
router.get("/status", adminMaintenanceController.obterStatusPublico);

module.exports = router;
