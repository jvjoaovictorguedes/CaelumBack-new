// Painel Administrativo — Códigos de Resgate, montada sob
// /api/admin/redemption-codes. Uma permissão só (codes.manage) cobre
// listar/criar/editar — não tem o mesmo motivo de players.view vs
// players.reward (ver adminGrantRoutes.js) porque não existe uma tela
// de "só ver" sem poder mexer que faça sentido aqui.
const express = require("express");
const adminRedemptionCodeController = require("../controllers/adminRedemptionCodeController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();
router.use(authMiddleware, adminMiddleware, requireAdminPermission("codes.manage"));

router.get("/", adminRedemptionCodeController.listar);
router.post("/", adminRedemptionCodeController.criar);
router.patch("/:id", adminRedemptionCodeController.atualizar);

module.exports = router;
