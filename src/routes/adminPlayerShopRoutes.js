// Painel Administrativo — "Loja do Aventureiro". Montada sob
// /api/admin/player-shops.
const express = require("express");
const adminPlayerShopController = require("../controllers/adminPlayerShopController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();

router.use(authMiddleware, adminMiddleware, requireAdminPermission("playershop.manage"));

router.get("/config", adminPlayerShopController.obterConfig);
router.put("/config", adminPlayerShopController.atualizarConfig);

router.get("/shops", adminPlayerShopController.listarLojas);
router.post("/shops/:idPersonagem/deactivate", adminPlayerShopController.desativarLoja);

router.get("/demands", adminPlayerShopController.listarDemandas);
router.post("/demands/:idDemanda/cancel", adminPlayerShopController.cancelarDemanda);

router.get("/commissions", adminPlayerShopController.listarEncomendas);
router.post("/commissions/:idEncomenda/cancel", adminPlayerShopController.cancelarEncomenda);

module.exports = router;
