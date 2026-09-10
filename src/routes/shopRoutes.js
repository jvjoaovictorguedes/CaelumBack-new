const express = require("express");
const shopController = require("../controllers/shopController");

const router = express.Router();

router.route("/purchase").post(shopController.purchaseItem);

module.exports = router;
