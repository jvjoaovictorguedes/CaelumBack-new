// Painel Administrativo §51 — montada sob /api/admin/items.
const express = require("express");
const adminItemController = require("../controllers/adminItemController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();

router.use(authMiddleware, adminMiddleware, requireAdminPermission("items.manage"));

router.get("/", adminItemController.listar);
router.post("/", adminItemController.criar);
router.put("/:id", adminItemController.atualizar);
router.post("/:id/deactivate", adminItemController.desativar);

module.exports = router;
