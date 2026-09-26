// Painel Administrativo — "Referral". Montada sob /api/admin/referrals.
// Só leitura; permissão própria "referrals.view" (mesma distribuição de
// roles de "players.view" — SuperAdmin/GameMaster/Suporte).
const express = require("express");
const adminReferralController = require("../controllers/adminReferralController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();
router.use(authMiddleware, adminMiddleware, requireAdminPermission("referrals.view"));

router.get("/", adminReferralController.listarIndicados);
router.get("/resumo", adminReferralController.obterResumo);

module.exports = router;
