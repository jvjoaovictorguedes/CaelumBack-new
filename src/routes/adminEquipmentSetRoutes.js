// Painel Administrativo Fase 4 — montada sob /api/admin/equipment-sets.
const express = require("express");
const adminEquipmentSetController = require("../controllers/adminEquipmentSetController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();

router.use(authMiddleware, adminMiddleware, requireAdminPermission("equipmentsets.manage"));

router.get("/effects", adminEquipmentSetController.listarEfeitos);

router.get("/", adminEquipmentSetController.listar);
router.post("/", adminEquipmentSetController.criar);
router.patch("/:id", adminEquipmentSetController.atualizar);
router.post("/:id/duplicate", adminEquipmentSetController.duplicar);
router.post("/:id/preview", adminEquipmentSetController.preview);

router.post("/:id/pieces", adminEquipmentSetController.adicionarPeca);
router.delete("/pieces/:idPeca", adminEquipmentSetController.removerPeca);

router.post("/:id/bonuses", adminEquipmentSetController.adicionarBonus);
router.patch("/bonuses/:idBonus", adminEquipmentSetController.atualizarBonus);
router.delete("/bonuses/:idBonus", adminEquipmentSetController.removerBonus);

module.exports = router;
