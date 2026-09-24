// Painel Administrativo §7/§59 (módulo Administradores) — montada sob
// /api/admin/admins.
const express = require("express");
const adminRoleController = require("../controllers/adminRoleController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();

router.use(authMiddleware, adminMiddleware, requireAdminPermission("admins.manage"));

router.get("/roles", adminRoleController.listarRoles);
router.get("/", adminRoleController.listarAdmins);
router.post("/grant", adminRoleController.concederRole);
router.post("/revoke", adminRoleController.revogarRole);

module.exports = router;
