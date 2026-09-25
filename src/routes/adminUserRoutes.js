// Painel Administrativo — Excluir Contas de Usuário. Montada sob
// /api/admin/users. Permissão "users.delete" própria (só SuperAdmin por
// padrão, ver migration 20261129010000) por ser destrutiva — não usa
// "admins.manage" nem nenhuma permissão de conteúdo existente.
const express = require("express");
const adminUserController = require("../controllers/adminUserController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();

router.use(authMiddleware, adminMiddleware, requireAdminPermission("users.delete"));

router.get("/", adminUserController.listarUsuarios);
router.get("/eligible-ids", adminUserController.listarIdsElegiveis);
router.post("/bulk-delete", adminUserController.excluirEmLote);

module.exports = router;
