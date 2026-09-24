// Painel Administrativo §44/§51 — montada sob /api/admin/audit.
const express = require("express");
const adminAuditController = require("../controllers/adminAuditController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();

router.get("/", authMiddleware, adminMiddleware, requireAdminPermission("audit.view"), adminAuditController.listar);

module.exports = router;
