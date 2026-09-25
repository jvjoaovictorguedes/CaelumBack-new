// Painel Administrativo — "Mercado P2P". Montada sob /api/admin/market.
const express = require("express");
const adminMarketController = require("../controllers/adminMarketController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();

router.use(authMiddleware, adminMiddleware, requireAdminPermission("market.moderate"));

router.get("/listings", adminMarketController.listarAnuncios);
router.post("/listings/:id/cancel", adminMarketController.cancelarAnuncio);
router.get("/transactions", adminMarketController.listarTransacoes);

module.exports = router;
