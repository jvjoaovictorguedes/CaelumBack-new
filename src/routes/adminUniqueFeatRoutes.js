// src/routes/adminUniqueFeatRoutes.js — Sistema de Proezas Únicas §19.5.
// Reparo excepcional (revogar/transferir) exige uniquefeats.repair,
// SEPARADA e mais forte que uniquefeats.manage (só SuperAdmin tem —
// ver migration 20261206010000).
const express = require("express");
const adminUniqueFeatController = require("../controllers/adminUniqueFeatController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();

router.use(authMiddleware, adminMiddleware);

const podeGerenciar = requireAdminPermission("uniquefeats.manage");
const podeReparar = requireAdminPermission("uniquefeats.repair");

// Proezas
router.get("/", podeGerenciar, adminUniqueFeatController.listar);
router.get("/:id", podeGerenciar, adminUniqueFeatController.obter);
router.post("/", podeGerenciar, adminUniqueFeatController.criar);
router.put("/:id", podeGerenciar, adminUniqueFeatController.atualizar);
router.post("/:id/duplicate", podeGerenciar, adminUniqueFeatController.duplicar);
router.post("/:id/deactivate", podeGerenciar, adminUniqueFeatController.desativar);
router.post("/:id/reactivate", podeGerenciar, adminUniqueFeatController.reativar);

// Legados
router.get("/legados/:idPower", podeGerenciar, adminUniqueFeatController.obterLegado);
router.put("/legados/:idPower", podeGerenciar, adminUniqueFeatController.atualizarLegado);

// Triggers (só leitura + validação estrutural)
router.get("/triggers/schemas", podeGerenciar, adminUniqueFeatController.listarTriggers);
router.get("/triggers/schemas/:triggerKey", podeGerenciar, adminUniqueFeatController.obterTrigger);
router.post("/triggers/validar", podeGerenciar, adminUniqueFeatController.validarTrigger);

// Histórico e reparo excepcional
router.get("/claims/historico", podeGerenciar, adminUniqueFeatController.listarClaims);
router.post("/claims/:id/revogar", podeReparar, adminUniqueFeatController.revogarClaim);
router.post("/claims/:id/transferir", podeReparar, adminUniqueFeatController.transferirClaim);

module.exports = router;
