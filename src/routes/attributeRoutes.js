const express = require("express");

const attributeController = require("../controllers/attributeController");

const router = express.Router();

router.post("/:id", attributeController.distribuir);

router.post(
  "/:id/random",
  attributeController.distribuirAleatoriamente
);

module.exports = router;
