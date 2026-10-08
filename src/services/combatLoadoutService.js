const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const CharacterAbilities = require("../models/CharacterAbilities");
const Power = require("../models/Power");
const {
  MAX_HABILIDADES_ATIVAS_COMBATE: MAX,
} = require("./abilityLevelService");

// Fallback determinístico para habilidades antigas ou concedidas sem slot.
function habilidadesComSlots(rows) {
  const active = rows
    .filter((r) => r.is_active && r.Power?.tipo_poder === "Ativo")
    .map((r) => (r.get ? r.get({ plain: true }) : { ...r }))
    .sort((a, b) => a.id - b.id);
  const used = new Set();
  for (const row of active) {
    if (
      Number.isInteger(row.combat_slot) &&
      row.combat_slot >= 0 &&
      row.combat_slot < MAX &&
      !used.has(row.combat_slot)
    ) {
      used.add(row.combat_slot);
    } else row.combat_slot = null;
  }
  for (const row of active) {
    if (row.combat_slot != null) continue;
    row.combat_slot =
      Array.from({ length: MAX }, (_, i) => i).find((i) => !used.has(i)) ??
      null;
    if (row.combat_slot != null) used.add(row.combat_slot);
  }
  return active
    .filter((r) => r.combat_slot != null)
    .sort((a, b) => a.combat_slot - b.combat_slot);
}

async function definirSlot(abilityId, characterId, active, requestedSlot) {
  if (
    requestedSlot !== undefined &&
    (!Number.isInteger(requestedSlot) ||
      requestedSlot < 0 ||
      requestedSlot >= MAX)
  ) {
    throw Object.assign(
      new Error(`Slot de habilidade deve estar entre 0 e ${MAX - 1}.`),
      { statusCode: 400 },
    );
  }
  return sequelize.transaction(async (transaction) => {
    await Character.findByPk(characterId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const rows = await CharacterAbilities.findAll({
      where: { id_personagem: characterId },
      include: [{ model: Power }],
      transaction,
    });
    const chosen = rows.find((r) => r.id === Number(abilityId));
    const slots = habilidadesComSlots(rows);
    let slot = null;
    if (active) {
      slot =
        requestedSlot ??
        slots.find((r) => r.id === chosen.id)?.combat_slot ??
        Array.from({ length: MAX }, (_, i) => i).find(
          (i) => !slots.some((r) => r.combat_slot === i),
        );
      if (slot == null)
        throw Object.assign(
          new Error(`Você já tem ${MAX} habilidades marcadas pro combate.`),
          { statusCode: 400 },
        );
    }
    // Libera primeiro os slots para que movimentos/substituições sejam atômicos.
    const previous = slots.find((r) => r.id === chosen.id)?.combat_slot;
    const displaced = slots.find(
      (r) => r.combat_slot === slot && r.id !== chosen.id,
    );
    await CharacterAbilities.update(
      { combat_slot: null },
      { where: { id_personagem: characterId }, transaction },
    );
    for (const row of slots) {
      if (row.id === chosen.id) continue;
      const replacement =
        displaced?.id === row.id ? (previous ?? null) : row.combat_slot;
      await CharacterAbilities.update(
        { combat_slot: replacement, is_active: replacement != null },
        { where: { id: row.id }, transaction },
      );
    }
    chosen.is_active = active;
    chosen.combat_slot = slot;
    chosen.changed("combat_slot", true);
    await chosen.save({ transaction });
    return chosen;
  });
}

module.exports = { habilidadesComSlots, definirSlot };
