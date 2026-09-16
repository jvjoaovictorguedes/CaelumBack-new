const express = require("express");
const pvpController = require("../controllers/pvpController");

const router = express.Router();

router.get("/opponents/:characterId", pvpController.getOpponents);
router.get("/status/:characterId", pvpController.getStatus);
router.get("/ranking", pvpController.getRanking);
router.post("/challenge", pvpController.challenge);

module.exports = router;
