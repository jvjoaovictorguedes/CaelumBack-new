// Painel Administrativo — Alquimia (Caldeirão). Montada sob /api/admin/alchemy.
const express = require("express");
const adminAlchemyController = require("../controllers/adminAlchemyController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const router = express.Router();

router.use(authMiddleware, adminMiddleware, requireAdminPermission("alchemy.manage"));

router.get("/recipes", adminAlchemyController.listarReceitas);
router.post("/recipes", adminAlchemyController.criarReceita);
router.patch("/recipes/:id", adminAlchemyController.atualizarReceita);

// Construtor de Efeitos (spec Caldeirão §12) — escopado por Item, não por
// receita (um Item pode ganhar ConsumableEffect mesmo fora do Caldeirão).
router.get("/effect-types", adminAlchemyController.listarTiposDeEfeito);
router.get("/items/:idItem/effects", adminAlchemyController.listarEfeitosDoItem);
router.post("/items/:idItem/effects", adminAlchemyController.criarEfeito);
router.patch("/effects/:id", adminAlchemyController.atualizarEfeito);
router.delete("/effects/:id", adminAlchemyController.excluirEfeito);

// Preview server-side (spec Caldeirão §19) — simula o uso do item com
// vida/mana/buffs/escudo hipotéticos, sem ler/gravar nenhum Character real.
router.get("/items/:idItem/preview", adminAlchemyController.preverEfeitos);

module.exports = router;
