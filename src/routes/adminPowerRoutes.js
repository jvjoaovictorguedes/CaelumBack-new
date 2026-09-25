// Painel Administrativo Fases 5/6/7 — montada sob /api/admin/powers e
// /api/admin/status-effects (catálogo read-only).
const express = require("express");
const adminPowerController = require("../controllers/adminPowerController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");

const powersRouter = express.Router();
powersRouter.use(authMiddleware, adminMiddleware, requireAdminPermission("powers.manage"));

powersRouter.get("/", adminPowerController.listar);
powersRouter.post("/", adminPowerController.criar);
powersRouter.patch("/:id", adminPowerController.atualizar);
powersRouter.get("/:id/affected-players", adminPowerController.jogadoresAfetados);
powersRouter.post("/:id/duplicate", adminPowerController.duplicar);
powersRouter.get("/:id/preview-evolution", adminPowerController.previewEvolucao);
powersRouter.get("/:id/preview-status", adminPowerController.previewStatus);

powersRouter.get("/:id/links", adminPowerController.listarVinculos);
powersRouter.put("/:id/links/class", adminPowerController.vincularClasse);
powersRouter.delete("/:id/links/class/:idClasse", adminPowerController.desvincularClasse);
powersRouter.put("/:id/links/race", adminPowerController.vincularRaca);
powersRouter.delete("/:id/links/race/:idRaca", adminPowerController.desvincularRaca);

powersRouter.post("/:id/status-effects", adminPowerController.adicionarStatusEffect);
powersRouter.patch("/status-effects/:idEfeito", adminPowerController.atualizarStatusEffect);
powersRouter.delete("/status-effects/:idEfeito", adminPowerController.removerStatusEffect);

const statusEffectsRouter = express.Router();
statusEffectsRouter.use(authMiddleware, adminMiddleware, requireAdminPermission("powers.manage"));
statusEffectsRouter.get("/catalog", adminPowerController.catalogoDeStatus);

const weaponStatusEffectsRouter = express.Router({ mergeParams: true });
weaponStatusEffectsRouter.use(authMiddleware, adminMiddleware, requireAdminPermission("items.manage"));
weaponStatusEffectsRouter.get("/", adminPowerController.listarWeaponStatusEffects);
weaponStatusEffectsRouter.post("/", adminPowerController.adicionarWeaponStatusEffect);
weaponStatusEffectsRouter.patch("/:idEfeito", adminPowerController.atualizarWeaponStatusEffect);
weaponStatusEffectsRouter.delete("/:idEfeito", adminPowerController.removerWeaponStatusEffect);

module.exports = { powersRouter, statusEffectsRouter, weaponStatusEffectsRouter };
