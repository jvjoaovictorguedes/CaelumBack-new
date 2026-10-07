const F = require("./combatFormulas");
const defaults = Object.freeze({
  pve_enabled: true,
  pvp_enabled: false,
  min_multiplier: 0.05,
  max_multiplier: 3,
  family_bonus_cap: 50,
  effective_min: 1.15,
  weakened_max: 0.9,
  ineffective_max: 0.6,
  labels: {
    effective: "EFETIVO",
    neutral: "NEUTRO",
    weakened: "ENFRAQUECIDO",
    ineffective: "INEFICAZ",
  },
});
function config() {
  const stored = cache
    ? require("./gameSettingCache").obter("combat_typing.config", {})
    : {};
  const c = { ...defaults };
  if (stored && typeof stored === "object")
    for (const [k, v] of Object.entries(stored))
      if (
        k in defaults &&
        typeof v === typeof defaults[k] &&
        (typeof v !== "number" || Number.isFinite(v))
      )
        c[k] = v;
  c.pvp_enabled = false;
  if (
    !(
      c.min_multiplier > 0 &&
      c.min_multiplier <= 1 &&
      c.max_multiplier >= 1 &&
      c.max_multiplier <= 5 &&
      c.ineffective_max > 0 &&
      c.ineffective_max < c.weakened_max &&
      c.weakened_max < 1 &&
      c.effective_min > 1 &&
      c.effective_min <= 5 &&
      c.family_bonus_cap >= 0 &&
      c.family_bonus_cap <= 500
    )
  )
    return { ...defaults };
  if (
    !c.labels ||
    ["effective", "neutral", "weakened", "ineffective"].some(
      (k) =>
        typeof c.labels[k] !== "string" ||
        !c.labels[k].trim() ||
        c.labels[k].length > 30,
    )
  )
    c.labels = defaults.labels;
  return c;
}
let cache = null,
  expires = 0,
  pending = null;
async function catalog() {
  if (cache && Date.now() < expires) return cache;
  if (pending) return pending;
  pending = (async () => {
    const M = require("../models/combatTypingModels");
    const names = Object.keys(M).filter((k) => k !== "fields");
    const rows = await Promise.all(
      names.map((k) => M[k].findAll({ raw: true })),
    );
    cache = Object.fromEntries(names.map((k, i) => [k, rows[i]]));
    expires = Date.now() + 5000;
    return cache;
  })();
  try {
    return await pending;
  } finally {
    pending = null;
  }
}
function invalidate() {
  expires = 0;
}
const number = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);
function enabled(context = "PVE") {
  const c = config();
  return /PVP|RANKED|TOURNAMENT/i.test(context) ? c.pvp_enabled : c.pve_enabled;
}
function affinity(id) {
  const row = cache?.DamageAffinityType.find((a) => a.id === Number(id));
  return row
    ? { id: row.id, key: row.key, nome: row.nome, categoria: row.categoria }
    : null;
}
function classification(multiplier) {
  const c = config();
  return multiplier >= c.effective_min
    ? c.labels.effective
    : multiplier <= c.ineffective_max
      ? c.labels.ineffective
      : multiplier <= c.weakened_max
        ? c.labels.weakened
        : c.labels.neutral;
}
function profileEntries(id) {
  return Object.fromEntries(
    (cache?.CombatAffinityProfileEntry ?? [])
      .filter((e) => e.id_profile === Number(id))
      .map((e) => [e.id_affinity, number(e.multiplier, 1)]),
  );
}
function monsterProfile(entity) {
  const plain = entity?.toJSON?.() ?? entity ?? {};
  const family = cache?.MonsterFamily.find(
    (f) => f.id === Number(plain.monster_family_id),
  );
  return {
    family: family
      ? { id: family.id, key: family.key, nome: family.nome }
      : null,
    basicNature: plain.basic_attack_nature ?? "Fisico",
    basicAffinityId: plain.basic_attack_affinity_id ?? null,
    inherited: profileEntries(family?.default_affinity_profile_id),
    overrides: profileEntries(plain.affinity_profile_id),
    multipliers: {
      ...profileEntries(family?.default_affinity_profile_id),
      ...profileEntries(plain.affinity_profile_id),
    },
  };
}
async function attachMonster(actor, entity = actor) {
  await catalog();
  actor.combatTyping = monsterProfile(entity);
  return actor;
}
async function equipmentProfile(itemIds, weapon) {
  await catalog();
  const percentages = {};
  for (const e of cache.EquipmentAffinityModifier)
    if (itemIds.includes(e.id_item))
      percentages[e.id_affinity] =
        (percentages[e.id_affinity] ?? 0) +
        number(e.received_damage_pct) *
          itemIds.filter((id) => id === e.id_item).length;
  const multipliers = Object.fromEntries(
    Object.entries(percentages).map(([id, p]) => [id, clamp(1 + p / 100)]),
  );
  return {
    family: null,
    multipliers,
    percentages,
    weapon: weapon ? weaponProfile(weapon) : null,
  };
}
function weaponProfile(weapon) {
  const type = cache?.WeaponType.find(
    (t) => t.id === Number(weapon.weapon_type_id),
  );
  return {
    type: type ? { id: type.id, key: type.key, nome: type.nome } : null,
    nature:
      weapon.damage_nature_override ??
      type?.default_damage_nature ??
      weapon.tipo_dano ??
      "Fisico",
    affinityId:
      weapon.affinity_mode === "NEUTRAL"
        ? null
        : weapon.affinity_mode === "EXPLICIT"
          ? weapon.affinity_id
          : (type?.default_affinity_id ?? null),
    nativeElementId: weapon.native_element_id ?? null,
    elementalPct: number(weapon.elemental_damage_pct),
  };
}
function clamp(v) {
  const c = config();
  return Math.max(c.min_multiplier, Math.min(c.max_multiplier, number(v, 1)));
}
function defensiveMultiplier(target, id, buffs = []) {
  if (!id) return 1;
  let m = number(target.combatTyping?.multipliers?.[id], 1);
  const pct = (buffs.length ? buffs : (target.combatAffinityBuffs ?? []))
    .filter(
      (b) =>
        b.affinityId === Number(id) && b.effectKey === "AFFINITY_RECEIVED_PCT",
    )
    .reduce((s, b) => s + number(b.magnitude), 0);
  return clamp(m * (1 + pct / 100));
}
function attackProfile(actor, power) {
  const weapon =
    actor.combatTyping?.weapon ?? weaponProfile(actor.arma_equipada ?? {});
  if (power) {
    const nature = power.tipo_dano ?? "Fisico";
    return {
      nature,
      affinityId: ["Verdadeiro", "Nenhum"].includes(nature)
        ? null
        : power.affinity_mode === "INHERIT_WEAPON"
          ? (actor.combatTyping?.basicAffinityId ?? weapon.affinityId)
          : power.affinity_mode === "EXPLICIT"
            ? power.affinity_id
            : null,
      addedAffinityId: power.added_affinity_id,
      addedPct: number(power.added_damage_pct),
    };
  }
  return {
    nature: actor.combatTyping?.basicNature ?? weapon.nature,
    affinityId: actor.combatTyping?.basicAffinityId ?? weapon.affinityId,
    addedAffinityId: weapon.nativeElementId,
    addedPct: weapon.elementalPct,
  };
}
function familyBonus(actor, target, power) {
  const familyId = target.combatTyping?.family?.id;
  if (!familyId) return { total: 0, sources: [] };
  const w = actor.arma_equipada;
  const sources = [];
  for (const [name, owner, value] of [
    ["WeaponTypeFamilyBonus", "weapon_type_id", w?.weapon_type_id],
    ["WeaponFamilyBonus", "item_id", w?.id_item],
    ["PowerFamilyBonus", "power_id", power?.id],
  ])
    for (const row of cache?.[name] ?? [])
      if (row[owner] === Number(value) && row.monster_family_id === familyId)
        sources.push({
          source: name,
          damageBonusPct: number(row.damage_bonus_pct),
        });
  return {
    total: Math.min(
      config().family_bonus_cap,
      sources.reduce((s, r) => s + r.damageBonusPct, 0),
    ),
    sources,
  };
}
function components(actor, power, amount, buffs = []) {
  const p = attackProfile(actor, power);
  if (p.nature === "Nenhum" || amount <= 0) return [];
  const result = [
    {
      amount,
      nature: p.nature,
      affinityId: p.affinityId,
      source: power ? "POWER" : "BASIC_ATTACK",
    },
  ];
  if (p.nature !== "Verdadeiro") {
    if (p.addedAffinityId && p.addedPct > 0)
      result.push({
        amount: (amount * p.addedPct) / 100,
        nature: "Magico",
        affinityId: p.addedAffinityId,
        source: power ? "POWER_BONUS" : "WEAPON_BONUS",
      });
    for (const b of buffs)
      if (
        b.effectKey === "WEAPON_IMBUE" &&
        b.affinityId &&
        number(b.magnitude) > 0
      )
        result.push({
          amount: (amount * number(b.magnitude)) / 100,
          nature: "Magico",
          affinityId: b.affinityId,
          source: "WEAPON_IMBUE",
        });
  }
  return result;
}
function resolveDamage({
  amount,
  actor = {},
  target = {},
  power = null,
  context = "PVE",
  finalMultiplier = 1,
  buffs = [],
  defenderBuffs = [],
}) {
  power ??= actor.combatTyping?.attackPower ?? null;
  const active = enabled(context);
  const list = active
    ? components(actor, power, amount, buffs)
    : [
        {
          amount,
          nature: power?.tipo_dano ?? "Fisico",
          affinityId: null,
          source: power ? "POWER" : "BASIC_ATTACK",
        },
      ];
  const bonus = active
    ? familyBonus(actor, target, power)
    : { total: 0, sources: [] };
  const resolved = list
    .filter((c) => c.nature !== "Nenhum" && c.amount > 0)
    .map((c) => {
      const trueDamage = active && c.nature === "Verdadeiro";
      const afterDefense = trueDamage
        ? c.amount
        : F.aplicarMitigacaoDeDefesa(c.amount, target);
      const multiplier =
        active && !trueDamage
          ? defensiveMultiplier(target, c.affinityId, defenderBuffs)
          : 1;
      const familyPct = bonus.total;
      return {
        baseDamage: c.amount,
        damageAfterDefense: afterDefense,
        nature: c.nature,
        affinity: affinity(c.affinityId),
        affinityMultiplier: multiplier,
        effectivenessLabel:
          active && !trueDamage && c.affinityId
            ? classification(multiplier)
            : null,
        familyBonusPct: familyPct,
        source: c.source,
        finalDamage: Math.max(
          1,
          Math.round(
            afterDefense * multiplier * (1 + familyPct / 100) * finalMultiplier,
          ),
        ),
      };
    });
  const result = {
    totalDamage: resolved.reduce((s, c) => s + c.finalDamage, 0),
    components: resolved,
    defenderFamily: active ? (target.combatTyping?.family ?? null) : null,
    familyBonusSources: bonus.sources,
  };
  observe(context, result);
  return result;
}
// Existing physical formula is preserved verbatim; magical weapons use its
// canonical RNG/crit path with the magical attribute and class multiplier.
function basicDamage(actor, crit = {}, modifiers = new Map(), context = "PVE") {
  const p = attackProfile(actor, null);
  if (
    !enabled(context) ||
    p.nature !== "Magico" ||
    (actor.combatTyping?.basicNature && actor.inteligencia == null)
  )
    return F.calcularDanoBasico(actor, crit, modifiers);
  return F.calcularDanoBasico(
    {
      ...actor,
      forca: actor.inteligencia ?? 0,
      multiplicador_dano_fisico: actor.multiplicador_dano_magico ?? 1,
    },
    crit,
    modifiers,
  );
}
const metrics = new Map();
function observe(context, result) {
  const key = String(context).slice(0, 30);
  if (!metrics.has(key) && metrics.size >= 20) return;
  const m = metrics.get(key) ?? {
    hits: 0,
    baseDamage: 0,
    finalDamage: 0,
    labels: {},
  };
  m.hits++;
  for (const c of result.components) {
    m.baseDamage += c.damageAfterDefense;
    m.finalDamage += c.finalDamage;
    if (c.effectivenessLabel)
      m.labels[c.effectivenessLabel] =
        (m.labels[c.effectivenessLabel] ?? 0) + 1;
  }
  metrics.set(key, m);
}
function summaries() {
  return Object.fromEntries(metrics);
}
function publicDefense(actor) {
  return (cache?.DamageAffinityType ?? [])
    .filter((a) => a.ativo)
    .map((a) => ({
      ...affinity(a.id),
      multiplier: defensiveMultiplier(actor, a.id),
      effectivenessLabel: classification(defensiveMultiplier(actor, a.id)),
    }));
}
module.exports = {
  defaults,
  config,
  catalog,
  invalidate,
  enabled,
  affinity,
  classification,
  monsterProfile,
  attachMonster,
  equipmentProfile,
  weaponProfile,
  attackProfile,
  defensiveMultiplier,
  familyBonus,
  components,
  resolveDamage,
  basicDamage,
  publicDefense,
  summaries,
};
function describe(resolution) {
  return resolution.components
    .map(
      (c) =>
        `${c.affinity?.nome ?? c.nature}: ${c.finalDamage}${c.effectivenessLabel ? ` (${c.effectivenessLabel}, ${c.affinityMultiplier.toFixed(2)}x)` : ""}${c.familyBonusPct ? ` +${c.familyBonusPct}% contra ${resolution.defenderFamily?.nome ?? "família"}` : ""}`,
    )
    .join("; ");
}
module.exports.describe = describe;

function applyPowerBuffs(list, power) {
  let result = list ?? [];
  if (power?.imbue_affinity_id && power.imbue_duration_turns > 0)
    result = [
      ...result.filter((b) => b.effectKey !== "WEAPON_IMBUE"),
      {
        effectKey: "WEAPON_IMBUE",
        affinityId: power.imbue_affinity_id,
        magnitude: number(power.imbue_damage_pct),
        remainingTurns: power.imbue_duration_turns + 1,
        sourcePowerId: power.id,
      },
    ];
  if (power?.defensive_affinity_id && power.defensive_duration_turns > 0)
    result = [
      ...result.filter(
        (b) =>
          !(
            b.effectKey === "AFFINITY_RECEIVED_PCT" &&
            b.affinityId === power.defensive_affinity_id
          ),
      ),
      {
        effectKey: "AFFINITY_RECEIVED_PCT",
        affinityId: power.defensive_affinity_id,
        magnitude: number(power.defensive_received_pct),
        remainingTurns: power.defensive_duration_turns + 1,
        sourcePowerId: power.id,
      },
    ];
  return result;
}
module.exports.applyPowerBuffs = applyPowerBuffs;
