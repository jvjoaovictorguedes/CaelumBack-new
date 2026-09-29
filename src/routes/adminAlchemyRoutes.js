// Painel Administrativo — Alquimia (Caldeirão). Montada sob /api/admin/alchemy.
const express = require("express");
const adminAlchemyController = require("../controllers/adminAlchemyController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();

router.use(authMiddleware, adminMiddleware, requireAdminPermission("alchemy.manage"));

router.get("/recipes", adminAlchemyController.listarReceitas);
router.post("/recipes", adminAlchemyController.criarReceita);
router.patch("/recipes/:id", adminAlchemyController.atualizarReceita);

module.exports = router;
