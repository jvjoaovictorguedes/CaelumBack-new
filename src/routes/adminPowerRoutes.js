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
powersRouter.get("/:id/preview-combinado", adminPowerController.previewCombinado);

powersRouter.get("/:id/links", adminPowerController.listarVinculos);
powersRouter.put("/:id/links/class", adminPowerController.vincularClasse);
powersRouter.delete("/:id/links/class/:idClasse", adminPowerController.desvincularClasse);
powersRouter.put("/:id/links/race", adminPowerController.vincularRaca);
powersRouter.delete("/:id/links/race/:idRaca", adminPowerController.desvincularRaca);
powersRouter.put("/:id/links/nature", adminPowerController.vincularNatureza);
powersRouter.delete("/:id/links/nature/:naturezaMagica", adminPowerController.desvincularNatureza);

powersRouter.post("/:id/status-effects", adminPowerController.adicionarStatusEffect);
powersRouter.patch("/status-effects/:idEfeito", adminPowerController.atualizarStatusEffect);
powersRouter.delete("/status-effects/:idEfeito", adminPowerController.removerStatusEffect);

// Habilidades V2.0 (doc "Habilidades V2.0" §7/§17) — Fase 4.
powersRouter.get("/:id/combat-effects", adminPowerController.listarCombatEffects);
powersRouter.post("/:id/combat-effects", adminPowerController.adicionarCombatEffect);
powersRouter.patch("/combat-effects/:idEfeito", adminPowerController.atualizarCombatEffect);
powersRouter.delete("/combat-effects/:idEfeito", adminPowerController.removerCombatEffect);

const statusEffectsRouter = express.Router();
statusEffectsRouter.use(authMiddleware, adminMiddleware, requireAdminPermission("powers.manage"));
statusEffectsRouter.get("/catalog", adminPowerController.catalogoDeStatus);

const combatEffectsRouter = express.Router();
combatEffectsRouter.use(authMiddleware, adminMiddleware, requireAdminPermission("powers.manage"));
combatEffectsRouter.get("/catalog", adminPowerController.catalogoDeCombatEffects);

const weaponStatusEffectsRouter = express.Router({ mergeParams: true });
weaponStatusEffectsRouter.use(authMiddleware, adminMiddleware, requireAdminPermission("items.manage"));
weaponStatusEffectsRouter.get("/", adminPowerController.listarWeaponStatusEffects);
weaponStatusEffectsRouter.post("/", adminPowerController.adicionarWeaponStatusEffect);
weaponStatusEffectsRouter.patch("/:idEfeito", adminPowerController.atualizarWeaponStatusEffect);
weaponStatusEffectsRouter.delete("/:idEfeito", adminPowerController.removerWeaponStatusEffect);

// Livro de Habilidade (montado sob /admin/items/:idItem/power-book —
// Habilidades V2.0 §13).
const powerBookRouter = express.Router({ mergeParams: true });
powerBookRouter.use(authMiddleware, adminMiddleware, requireAdminPermission("items.manage"));
powerBookRouter.get("/", adminPowerController.obterPowerBook);
powerBookRouter.put("/", adminPowerController.salvarPowerBook);
powerBookRouter.delete("/", adminPowerController.removerPowerBook);

module.exports = { powersRouter, statusEffectsRouter, combatEffectsRouter, weaponStatusEffectsRouter, powerBookRouter };
