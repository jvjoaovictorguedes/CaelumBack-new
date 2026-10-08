const router = require("express").Router();
const typing = require("../services/combatTypingService");
const { Op } = require("sequelize");
const M = require("../models/combatTypingModels");
router.use(require("../middlewares/authMiddleware"));
router.get("/items/:id", async (req, res, next) => {
  try {
    const id = require("../services/combatTypingAdminService").id(
      req.params.id,
    );
    const item = await require("../models/Item").findByPk(id);
    if (!item) return res.status(404).json({ message: "Item não encontrado." });
    const c = await typing.catalog();
    const weapon = await require("../models/WeaponProperties").findByPk(id);
    const family = (familyId) => {
      const f = c.MonsterFamily.find((f) => f.id === familyId);
      return f ? { id: f.id, nome: f.nome, key: f.key } : null;
    };
    res.json({
      status: "success",
      data: {
        weapon: weapon ? typing.weaponProfile(weapon.toJSON()) : null,
        affinity: weapon
          ? typing.affinity(typing.weaponProfile(weapon.toJSON()).affinityId)
          : null,
        nativeElement: weapon
          ? typing.affinity(weapon.native_element_id)
          : null,
        modifiers: c.EquipmentAffinityModifier.filter(
          (m) => m.id_item === id,
        ).map((m) => ({
          affinity: typing.affinity(m.id_affinity),
          receivedDamagePct: Number(m.received_damage_pct),
        })),
        familyBonuses: [
          ...c.WeaponFamilyBonus.filter((b) => b.item_id === id),
          ...c.WeaponTypeFamilyBonus.filter(
            (b) => b.weapon_type_id === weapon?.weapon_type_id,
          ),
        ].map((b) => ({
          family: family(b.monster_family_id),
          damageBonusPct: Number(b.damage_bonus_pct),
        })),
      },
    });
  } catch (e) {
    if (e.statusCode)
      return res.status(e.statusCode).json({ message: e.message });
    next(e);
  }
});
router.get("/powers/:id", async (req, res, next) => {
  try {
    const id = require("../services/combatTypingAdminService").id(
      req.params.id,
    );
    const p = await require("../models/Power").findByPk(id);
    if (!p || p.usage_scope === "MONSTER")
      return res.status(404).json({ message: "Power não encontrada." });
    const c = await typing.catalog();
    res.json({
      status: "success",
      data: {
        nature: p.tipo_dano,
        affinityMode: p.affinity_mode,
        affinity: typing.affinity(p.affinity_id),
        addedAffinity: typing.affinity(p.added_affinity_id),
        addedDamagePct: Number(p.added_damage_pct),
        imbueAffinity: typing.affinity(p.imbue_affinity_id),
        imbueDamagePct: Number(p.imbue_damage_pct),
        imbueDurationTurns: p.imbue_duration_turns,
        familyBonuses: c.PowerFamilyBonus.filter((b) => b.power_id === id).map(
          (b) => ({
            family:
              c.MonsterFamily.find((f) => f.id === b.monster_family_id)?.nome ??
              null,
            damageBonusPct: Number(b.damage_bonus_pct),
          }),
        ),
      },
    });
  } catch (e) {
    if (e.statusCode)
      return res.status(e.statusCode).json({ message: e.message });
    next(e);
  }
});
router.get(
  "/items/:id/compare",
  require("../middlewares/currentCharacterMiddleware").carregarPersonagemAtual,
  async (req, res, next) => {
    try {
      const id = require("../services/combatTypingAdminService").id(
        req.params.id,
      );
      const item = await require("../models/Item").findByPk(id);
      if (!item)
        return res.status(404).json({ message: "Item não encontrado." });
      const equipment=require("../services/equipmentInstanceService");
      if(!equipment.ehEquipavelCombate(item.tipo_item))return res.status(400).json({message:"Item não é equipamento."});
      const slot=await equipment.resolverSlot(item);
      const equipped = await require("../models/CharacterEquipment").findAll({
        where: { id_personagem: req.personagemAtual.id },
        raw: true,
      });
      const before = await typing.equipmentProfile(
          equipped.map((e) => e.id_item),
          null,
        ),
        after = await typing.equipmentProfile(
          [
            ...equipped.filter((e) => e.slot !== slot).map((e) => e.id_item),
            id,
          ],
          null,
        );
      const current = typing.publicDefense({ combatTyping: before }),
        nextProfile = typing.publicDefense({ combatTyping: after });
      res.json({
        status: "success",
        data: {
          slot,
          affinities: nextProfile.map((a) => ({
            ...a,
            beforeMultiplier: current.find((c) => c.id === a.id).multiplier,
            delta: a.multiplier - current.find((c) => c.id === a.id).multiplier,
          })),
        },
      });
    } catch (e) {
      if (e.statusCode)
        return res.status(e.statusCode).json({ message: e.message });
      next(e);
    }
  },
);
module.exports = router;
