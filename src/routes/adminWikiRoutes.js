// Painel Administrativo — Wiki do Jogo. Montada sob /api/admin/wiki.
const express = require("express");
const adminWikiController = require("../controllers/adminWikiController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();

router.use(authMiddleware, adminMiddleware, requireAdminPermission("wiki.manage"));

router.get("/", adminWikiController.listar);
router.get("/categories", adminWikiController.listarCategorias);
router.post("/", adminWikiController.criar);
router.patch("/:id", adminWikiController.atualizar);
router.post("/:id/duplicate", adminWikiController.duplicar);
router.delete("/:id", adminWikiController.excluir);

module.exports = router;
