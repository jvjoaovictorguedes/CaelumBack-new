// Estado efêmero, serializável no encontro/sessão. Nunca altera atributos
// permanentes nem mantém Maps dentro de JSONB.
const modifiers = require("./combatModifierService");
const buffs = require("./combatBuffService");
const statuses = require("./statusEffectService");

const INSTANT = new Set([
  "REGEN_HP_FLAT",
  "REGEN_HP_PERCENT",
  "REGEN_MANA_FLAT",
  "REGEN_MANA_PERCENT",
  "RESTORE_MANA_ON_TRIGGER",
  "GRANT_SHIELD",
  "SHIELD_ON_CAST",
  "CLEANSE_STATUS",
  "CLEANSE_CATEGORY",
  "DISPEL_BUFF",
  "REDUCE_COOLDOWN",
]);

function participant(actor, options = {}) {
  actor.powerCombatState ??= { started: false, turn: 0, effects: [] };
  const p = {
    actor,
    modifiers: new Map(),
    triggers: new Map(),
    status: [],
    shield: null,
    cooldowns: {},
    hpMax: actor.vida_maxima ?? actor.vida_atual ?? 0,
    mpMax: actor.mana_maxima ?? actor.mana_atual ?? 0,
    ...options,
  };
  p.shield ??= actor.powerCombatState.shield ?? null;
  return p;
}

function effective(p, nextTurn = false) {
  const result = new Map(p.modifiers);
  for (const [key, value] of modifiers.resolverModificadores(
    p.actor.powerCombatState.effects.filter(
      (e) =>
        !nextTurn ||
        e.expiresAfterTurn == null ||
        e.expiresAfterTurn >= p.actor.powerCombatState.turn + 1,
    ),
  )) {
    result.set(key, (result.get(key) ?? 0) + value);
  }
  return result;
}

function condition(row, source, target) {
  const config = row.condition_config ?? {};
  const hpBelow = (p) =>
    p.hpMax > 0 && (p.actor.vida_atual / p.hpMax) * 100 < config.limite_pct;
  switch (row.condition_key) {
    case null:
    case undefined:
    case "":
      return true;
    case "SELF_HP_BELOW_PCT":
      return hpBelow(source);
    case "TARGET_HP_BELOW_PCT":
      return hpBelow(target);
    case "SELF_HAS_STATUS":
      return source.status.some((s) => s.key === config.status_key);
    case "TARGET_HAS_STATUS":
      return target.status.some((s) => s.key === config.status_key);
    case "TARGET_HAS_DEBUFF_GROUP":
      return target.actor.powerCombatState.effects.some(
        (e) =>
          (e.stack_group === config.stack_group ||
            e.group === config.stack_group) &&
          e.sourceTeam !== target.team,
      );
    default:
      return false;
  }
}

function applyModifier(row, source, target, trigger) {
  const state = target.actor.powerCombatState;
  const sourceId = `${source.key ?? source.actor.id ?? source.team}:${row.id ?? row.sourcePowerId ?? row.effect_key}`;
  const group = row.stack_group ?? sourceId;
  const same = (e) => e.effect_key === row.effect_key && e.group === group;
  const existing = state.effects.filter(same);
  const duringAction =
    state.inTurn && ["COMBAT_START", "TURN_START", "ON_CAST"].includes(trigger);
  const duration = row.duration_turns;
  const entry = {
    ...row,
    sourceId,
    sourceTeam: source.team,
    group,
    expiresAfterTurn:
      duration == null ? null : state.turn + duration - (duringAction ? 1 : 0),
  };
  const policy = row.reapply_policy ?? "REFRESH";
  if (policy === "BLOCK_WHILE_ACTIVE" && existing.length) return;
  if (
    policy === "STRONGEST" &&
    existing.some((e) => Math.abs(e.magnitude) >= Math.abs(row.magnitude))
  )
    return;
  if (policy === "STACK") {
    if (existing.length >= Math.max(1, row.max_stacks ?? 1)) {
      state.effects.splice(state.effects.indexOf(existing[0]), 1);
    }
  } else if (policy === "UNIQUE_SOURCE") {
    state.effects = state.effects.filter(
      (e) => !same(e) || e.sourceId !== sourceId,
    );
  } else if (policy === "REFRESH" && existing.length) {
    existing.forEach((e) => {
      e.expiresAfterTurn = entry.expiresAfterTurn;
    });
    return;
  } else {
    state.effects = state.effects.filter((e) => !same(e));
  }
  // Policies already resolve temporal conflicts. Separate UNIQUE_SOURCE
  // sources aggregate independently, while STACK shares its canonical group.
  entry.stack_group =
    policy === "UNIQUE_SOURCE" ? `${group}:${sourceId}` : group;
  state.effects.push(entry);
}

function apply(row, source, target, trigger) {
  const actor = target.actor;
  if (!INSTANT.has(row.effect_key))
    return applyModifier(row, source, target, trigger);
  const n = Math.max(0, Math.round(row.magnitude));
  switch (row.effect_key) {
    case "REGEN_HP_FLAT":
    case "REGEN_HP_PERCENT": {
      const amount = row.effect_key.endsWith("PERCENT")
        ? (target.hpMax * row.magnitude) / 100
        : n;
      actor.vida_atual = Math.min(
        target.hpMax,
        actor.vida_atual + Math.max(0, Math.round(amount)),
      );
      break;
    }
    case "REGEN_MANA_FLAT":
    case "REGEN_MANA_PERCENT":
    case "RESTORE_MANA_ON_TRIGGER": {
      const amount = row.effect_key.endsWith("PERCENT")
        ? (target.mpMax * row.magnitude) / 100
        : n;
      actor.mana_atual = Math.min(
        target.mpMax,
        (actor.mana_atual ?? 0) + Math.max(0, Math.round(amount)),
      );
      break;
    }
    case "GRANT_SHIELD":
    case "SHIELD_ON_CAST":
      if (n > 0) {
        target.shield = buffs.concederEscudo(
          target.shield,
          n,
          row.duration_turns ?? 1,
        );
        const state = actor.powerCombatState;
        state.shieldExpiresAfterTurn =
          state.turn +
          (row.duration_turns ?? 1) -
          (state.inTurn && ["TURN_START", "ON_CAST"].includes(trigger) ? 1 : 0);
      }
      break;
    case "CLEANSE_STATUS":
      target.status = statuses.removerStatus(
        target.status,
        row.config?.status_key,
      );
      break;
    case "CLEANSE_CATEGORY":
      target.status = statuses.removerStatusPorCategoria(
        target.status,
        row.config?.category,
      );
      break;
    case "DISPEL_BUFF": {
      const index = actor.powerCombatState.effects.findIndex(
        (e) =>
          e.dispellable !== false &&
          (!row.config?.stack_group ||
            e.stack_group === row.config.stack_group),
      );
      if (index >= 0) actor.powerCombatState.effects.splice(index, 1);
      break;
    }
    case "REDUCE_COOLDOWN":
      for (const key of Object.keys(target.cooldowns))
        target.cooldowns[key] = Math.max(0, target.cooldowns[key] - n);
      break;
  }
}

function emit(
  trigger,
  source,
  opponent,
  participants = [source, opponent],
  random = Math.random,
) {
  if (!(source.actor.vida_atual > 0)) return;
  const restoration = new Map();
  for (const row of source.triggers.get(trigger) ?? []) {
    const targets =
      row.target === "ALL_ALLIES"
        ? participants.filter((p) => p.team === source.team)
        : row.target === "ALL_ENEMIES"
          ? participants.filter((p) => p.team !== source.team)
          : row.target === "ENEMY"
            ? [opponent]
            : [source];
    const eligible = targets.filter(
      (target) =>
        target && target.actor.vida_atual > 0 && condition(row, source, target),
    );
    if (
      !eligible.length ||
      random() * 1_000_000 >= (row.chance_ppm ?? 1_000_000)
    )
      continue;
    for (const target of eligible) {
      if (
        row.effect_key.startsWith("REGEN_") ||
        row.effect_key === "RESTORE_MANA_ON_TRIGGER"
      ) {
        const rows = restoration.get(target) ?? [];
        rows.push(row);
        restoration.set(target, rows);
      } else apply(row, source, target, trigger);
    }
  }
  // Instantaneous regeneration retains the legacy group aggregation; it
  // does not create an active buff to refresh on a later event.
  for (const [target, rows] of restoration) {
    for (const [effect_key, magnitude] of modifiers.resolverModificadores(
      rows,
    )) {
      apply({ effect_key, magnitude }, source, target, trigger);
    }
  }
}

function start(source, opponent, participants) {
  const state = source.actor.powerCombatState;
  // An unloaded defender must still receive COMBAT_START when its catalog is available.
  if (!state.started && source.triggers.size) {
    state.started = true;
    emit("COMBAT_START", source, opponent, participants);
  }
}

function begin(source, opponent, participants) {
  start(source, opponent, participants);
  start(opponent, source, participants);
  const state = source.actor.powerCombatState;
  state.turn += 1;
  if (
    state.shieldExpiresAfterTurn != null &&
    state.shieldExpiresAfterTurn < state.turn
  ) {
    source.shield = null;
    state.shield = null;
    delete state.shieldExpiresAfterTurn;
  }
  state.inTurn = true;
  state.effects = state.effects.filter(
    (e) => e.expiresAfterTurn == null || e.expiresAfterTurn >= state.turn,
  );
  emit("TURN_START", source, opponent, participants);
}

function end(source, opponent, participants) {
  emit("TURN_END", source, opponent, participants);
  source.actor.powerCombatState.inTurn = false;
  for (const p of participants ?? [source, opponent])
    p.actor.powerCombatState.shield = p.shield;
}

module.exports = { participant, effective, condition, emit, begin, end, start };
