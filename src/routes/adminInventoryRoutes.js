// Painel Administrativo — "Inventário". Montada sob /api/admin/inventory.
const express = require("express");
const adminInventoryController = require("../controllers/adminInventoryController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();

router.use(authMiddleware, adminMiddleware, requireAdminPermission("players.manage"));

router.get("/:idPersonagem", adminInventoryController.obterInventario);
router.patch("/:idPersonagem/stack/:idItem", adminInventoryController.corrigirStack);
router.delete("/equipment/:idInstancia", adminInventoryController.removerEquipamento);

module.exports = router;
