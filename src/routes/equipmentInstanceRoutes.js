// Inventário v2 (§8) — equipar/desequipar por INSTÂNCIA.
const express = require("express");
const equipmentInstanceController = require("../controllers/equipmentInstanceController");
const authMiddleware = require("../middlewares/authMiddleware");
const { carregarPersonagemAtual } = require("../middlewares/currentCharacterMiddleware");

const router = express.Router();

router.post(
  "/instances/:instanceId/equip",
  authMiddleware,
  carregarPersonagemAtual,
  equipmentInstanceController.equipar,
);
router.post(
  "/slots/:slot/unequip",
  authMiddleware,
  carregarPersonagemAtual,
  equipmentInstanceController.desequipar,
);

module.exports = router;
