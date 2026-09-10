const express = require("express");
const characterInventoryController = require("../controllers/characterInventoryController");

const router = express.Router();

router.route("/use").post(characterInventoryController.useItem);

module.exports = router;
