const express = require("express");
const fishingController = require("../controllers/fishingController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();
router.use(authMiddleware, carregarPersonagemAtual);

router.get("/progress", fishingController.getProgresso);
router.get("/zones", fishingController.getZonas);
router.get("/zones/:id/species", fishingController.getZonaEspecies);
router.get("/rods", fishingController.getRods);
router.get("/loadout", fishingController.getLoadout);
router.put("/loadout/rod", fishingController.putLoadoutRod);
router.get("/baits", fishingController.getBaits);
router.get("/almanac", fishingController.getAlmanac);

router.get("/sessions/active", fishingController.getSessaoAtiva);
router.post("/sessions/start", fishingController.postStart);
router.post("/sessions/:id/cast", fishingController.postCast);
router.post("/sessions/:id/hook", fishingController.postHook);
router.post("/sessions/:id/reel", fishingController.postReel);
router.post("/sessions/:id/abandon", fishingController.postAbandon);

router.get("/navigation/ports", fishingController.getPorts);
router.get("/navigation/vessels", fishingController.getVessels);
router.get("/navigation/routes", fishingController.getRoutes);
router.get("/navigation/state", fishingController.getNavigationState);
router.post("/navigation/vessels/:id/acquire", fishingController.postAcquireVessel);
router.post("/navigation/travel", fishingController.postTravel);

module.exports = router;
