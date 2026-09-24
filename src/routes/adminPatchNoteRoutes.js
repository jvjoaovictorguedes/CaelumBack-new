// Painel Administrativo Fase 13 (§24) — montada sob /api/admin/patch-notes.
const express = require("express");
const adminPatchNoteController = require("../controllers/adminPatchNoteController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();

router.use(authMiddleware, adminMiddleware, requireAdminPermission("patchnotes.manage"));

router.get("/", adminPatchNoteController.listar);
router.post("/", adminPatchNoteController.criar);
router.patch("/:id", adminPatchNoteController.atualizar);
router.post("/:id/duplicate", adminPatchNoteController.duplicar);

module.exports = router;
