// Painel Administrativo — Pesca. Montada sob /api/admin/fishing.
const express = require("express");
const adminFishingController = require("../controllers/adminFishingController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();

router.use(authMiddleware, adminMiddleware, requireAdminPermission("fishing.manage"));

router.get("/zones", adminFishingController.listarZonas);
router.post("/zones", adminFishingController.criarZona);
router.patch("/zones/:id", adminFishingController.atualizarZona);

router.get("/species", adminFishingController.listarEspecies);
router.post("/species", adminFishingController.criarEspecie);
router.patch("/species/:id", adminFishingController.atualizarEspecie);

router.get("/pool", adminFishingController.listarPool);
router.post("/pool", adminFishingController.criarPool);
router.patch("/pool/:id", adminFishingController.atualizarPool);

router.get("/ports", adminFishingController.listarPortos);
router.post("/ports", adminFishingController.criarPorto);
router.patch("/ports/:id", adminFishingController.atualizarPorto);

router.get("/baits", adminFishingController.listarIscas);
router.post("/baits", adminFishingController.criarIsca);
router.patch("/baits/:idItem", adminFishingController.atualizarIsca);

router.get("/affinities", adminFishingController.listarAfinidades);
router.post("/affinities", adminFishingController.criarAfinidade);
router.patch("/affinities/:id", adminFishingController.atualizarAfinidade);

router.get("/vessels", adminFishingController.listarVessels);
router.post("/vessels", adminFishingController.criarVessel);
router.patch("/vessels/:id", adminFishingController.atualizarVessel);

router.get("/routes", adminFishingController.listarRotas);
router.post("/routes", adminFishingController.criarRota);
router.patch("/routes/:id", adminFishingController.atualizarRota);

router.get("/tournaments", adminFishingController.listarTorneios);
router.post("/tournaments", adminFishingController.criarTorneio);
router.patch("/tournaments/:id", adminFishingController.atualizarTorneio);

module.exports = router;
