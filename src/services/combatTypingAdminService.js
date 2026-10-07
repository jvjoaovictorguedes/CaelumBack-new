const M = require("../models/combatTypingModels");
const typing = require("./combatTypingService");
const { sequelize } = require("../config/database");
const { registrarAcao } = require("./adminAuditService");
const Setting = require("../models/GameSetting");
const catalogs = {
  affinities: M.DamageAffinityType,
  weapons: M.WeaponType,
  families: M.MonsterFamily,
  profiles: M.CombatAffinityProfile,
};
const entities = {
  weapons: require("../models/WeaponProperties"),
  powers: require("../models/Power"),
  monsters: require("../models/AdventureMonster"),
  "guild-bosses": require("../models/GuildBossConfig"),
  "world-bosses": require("../models/WorldBossConfig"),
  equipment: require("../models/Item"),
};
const fail = (message) =>
  Object.assign(new Error(message), { statusCode: 400 });
const integer = (v) => Number.isInteger(v) && v > 0;
function id(v) {
  const n = Number(v);
  if (!integer(n)) throw fail("Identificação inválida.");
  return n;
}
function bounded(v, min, max, label) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    throw fail(`${label}: valor inválido.`);
  return v;
}
async function reference(model, value, transaction) {
  if (value == null) return null;
  if (!integer(value)) throw fail("Referência inválida.");
  const row = await model.findByPk(value, { transaction });
  if (!row || row.ativo === false)
    throw fail("Referência inexistente ou inativa.");
  return row;
}
function reason(req) {
  if (
    typeof req.body.reason !== "string" ||
    req.body.reason.trim().length < 5 ||
    req.body.reason.length > 500
  )
    throw fail("Informe um motivo de 5 a 500 caracteres.");
  return req.body.reason.trim();
}
async function audited(req, entity, entityId, operation) {
  const motivo = reason(req);
  const result = await sequelize.transaction(async (transaction) => {
    const change = await operation(transaction);
    await registrarAcao({
      idAdmin: req.user.id,
      acao: "combat_typing.update",
      entidade: entity,
      idEntidade: entityId,
      dadosAntes: change.before,
      dadosDepois: change.after,
      motivo,
      req,
      transaction,
    });
    return change.after;
  });
  typing.invalidate();
  return result;
}
async function validateCatalog(kind, body, transaction, existing) {
  const values = {};
  for (const key of [
    "key",
    "nome",
    "descricao",
    "icon_key",
    "imagem_url",
    "ativo",
    "ordem",
    "categoria",
    "default_damage_nature",
    "default_affinity_id",
    "default_affinity_profile_id",
  ])
    if (key in body) values[key] = body[key];
  if ("key" in values && !/^[A-Z][A-Z0-9_]{0,59}$/.test(values.key))
    throw fail("Key deve usar letras maiúsculas, números e underscore.");
  for (const key of ["nome", "descricao", "icon_key", "imagem_url"])
    if (
      key in values &&
      values[key] != null &&
      (typeof values[key] !== "string" ||
        values[key].length >
          { nome: 120, descricao: 10000, icon_key: 120, imagem_url: 500 }[
            key
          ] ||
        (key === "nome" && !values[key].trim()))
    )
      throw fail("Texto inválido.");
  if ("ativo" in values && typeof values.ativo !== "boolean")
    throw fail("Ativo inválido.");
  if ("ordem" in values && !Number.isInteger(values.ordem))
    throw fail("Ordem inválida.");
  const merged = { ...(existing?.toJSON() ?? {}), ...values };
  if (
    kind === "affinities" &&
    !["PHYSICAL", "ELEMENTAL"].includes(merged.categoria)
  )
    throw fail("Categoria inválida.");
  if (kind === "weapons") {
    if (!["Fisico", "Magico"].includes(merged.default_damage_nature))
      throw fail("Natureza inválida.");
    const a = await reference(
      M.DamageAffinityType,
      merged.default_affinity_id,
      transaction,
    );
    if (
      a &&
      a.categoria !==
        (merged.default_damage_nature === "Fisico" ? "PHYSICAL" : "ELEMENTAL")
    )
      throw fail("Afinidade incompatível com a natureza.");
  }
  if (kind === "families")
    await reference(
      M.CombatAffinityProfile,
      merged.default_affinity_profile_id,
      transaction,
    );
  return Object.fromEntries(
    Object.entries(values).filter(([k]) => k in catalogs[kind].rawAttributes),
  );
}
async function listCatalog(kind) {
  const model = catalogs[kind];
  if (!model) throw fail("Catálogo inválido.");
  return model.findAll({
    order: [
      ["ordem", "ASC"],
      ["id", "ASC"],
    ],
  });
}
async function saveCatalog(req, kind, key) {
  const model = catalogs[kind];
  if (!model) throw fail("Catálogo inválido.");
  return audited(req, model.name, key, async (transaction) => {
    const row = key
      ? await model.findByPk(key, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        })
      : null;
    if (key && !row) throw fail("Registro não encontrado.");
    const before = row
      ? {
          ...row.toJSON(),
          ...(await catalogRelations(kind, row.id, transaction)),
        }
      : null;
    const fields = await validateCatalog(
      kind,
      req.body.values ?? {},
      transaction,
      row,
    );
    const saved = row
      ? await row.update(fields, { transaction })
      : await model.create(fields, { transaction });
    if (kind === "profiles" && "entries" in req.body)
      await replaceRows(
        M.CombatAffinityProfileEntry,
        "id_profile",
        saved.id,
        req.body.entries,
        "id_affinity",
        "multiplier",
        M.DamageAffinityType,
        0.05,
        5,
        transaction,
      );
    if (kind === "weapons" && "familyBonuses" in req.body)
      await replaceRows(
        M.WeaponTypeFamilyBonus,
        "weapon_type_id",
        saved.id,
        req.body.familyBonuses,
        "monster_family_id",
        "damage_bonus_pct",
        M.MonsterFamily,
        0,
        500,
        transaction,
      );
    return {
      before,
      after: {
        ...saved.toJSON(),
        ...(await catalogRelations(kind, saved.id, transaction)),
      },
    };
  });
}
async function replaceRows(
  model,
  owner,
  ownerId,
  rows,
  target,
  value,
  targetModel,
  min,
  max,
  transaction,
) {
  if (!Array.isArray(rows) || rows.length > 100)
    throw fail("Lista inválida (máximo 100 entradas).");
  const seen = new Set();
  for (const row of rows) {
    if (!row || seen.has(row[target]))
      throw fail("Entrada duplicada ou inválida.");
    seen.add(row[target]);
    await reference(targetModel, row[target], transaction);
    if (!integer(row[target])) throw fail("Referência obrigatória.");
    bounded(row[value], min, max, value);
  }
  await model.destroy({ where: { [owner]: ownerId }, transaction });
  if (rows.length)
    await model.bulkCreate(
      rows.map((r) => ({
        [owner]: ownerId,
        [target]: r[target],
        [value]: r[value],
      })),
      { transaction },
    );
}
function entityKind(kind) {
  return kind === "weapons"
    ? "weapon"
    : kind === "powers"
      ? "power"
      : ["monsters", "guild-bosses", "world-bosses"].includes(kind)
        ? "monster"
        : null;
}
async function listEntities(kind) {
  const model = entities[kind];
  if (!model) throw fail("Entidade inválida.");
  const attrs =
    kind === "weapons"
      ? ["id_item", "tipo_arma", "tipo_dano", "weapon_type_id"]
      : kind === "guild-bosses"
        ? ["id", "nome_chefe"]
        : ["id", "nome"];
  return model.findAll({ attributes: attrs, order: [[attrs[0], "ASC"]] });
}
async function detail(kind, key) {
  const model = entities[kind];
  if (!model) throw fail("Entidade inválida.");
  const row = await model.findByPk(key);
  if (!row) throw fail("Registro não encontrado.");
  await typing.catalog();
  const value = row.toJSON();
  const relations =
    kind === "weapons"
      ? {
          familyBonuses: await M.WeaponFamilyBonus.findAll({
            where: { item_id: key },
          }),
        }
      : kind === "powers"
        ? {
            familyBonuses: await M.PowerFamilyBonus.findAll({
              where: { power_id: key },
            }),
          }
        : kind === "equipment"
          ? {
              modifiers: await M.EquipmentAffinityModifier.findAll({
                where: { id_item: key },
              }),
            }
          : {};
  return {
    values: value,
    ...relations,
    preview:
      entityKind(kind) === "monster"
        ? typing.monsterProfile(value)
        : kind === "weapons"
          ? typing.weaponProfile(value)
          : null,
  };
}
async function validateEntity(kind, values, row, transaction) {
  const group = entityKind(kind);
  const fields = Object.fromEntries(
    Object.entries(values).filter(([k]) => k in (M.fields[group] ?? {})),
  );
  const merged = { ...row.toJSON(), ...fields };
  for (const key of [
    "affinity_id",
    "native_element_id",
    "added_affinity_id",
    "imbue_affinity_id",
    "basic_attack_affinity_id",
    "defensive_affinity_id",
  ])
    if (key in fields)
      await reference(M.DamageAffinityType, fields[key], transaction);
  if (group === "weapon") {
    await reference(M.WeaponType, merged.weapon_type_id, transaction);
    if (
      merged.damage_nature_override != null &&
      !["Fisico", "Magico"].includes(merged.damage_nature_override)
    )
      throw fail("Natureza inválida.");
    if (!["INHERIT", "EXPLICIT", "NEUTRAL"].includes(merged.affinity_mode))
      throw fail("Modo inválido.");
    if (merged.affinity_mode === "EXPLICIT" && !merged.affinity_id)
      throw fail("Escolha uma afinidade explícita.");
    bounded(
      Number(merged.elemental_damage_pct),
      0,
      500,
      "Componente elemental",
    );
    if (merged.elemental_damage_pct > 0 && !merged.native_element_id)
      throw fail("Escolha o elemento nativo.");
  }
  if (group === "power") {
    if (
      !["INHERIT_WEAPON", "EXPLICIT", "NEUTRAL"].includes(merged.affinity_mode)
    )
      throw fail("Modo inválido.");
    if (
      merged.affinity_mode === "INHERIT_WEAPON" &&
      merged.tipo_dano !== "Fisico"
    )
      throw fail("Somente Power física herda a arma.");
    if (
      ["Verdadeiro", "Nenhum"].includes(merged.tipo_dano) &&
      (merged.affinity_id ||
        merged.affinity_mode !== "NEUTRAL" ||
        Number(merged.added_damage_pct) > 0)
    )
      throw fail("Dano verdadeiro ou nenhum não possui afinidade ofensiva.");
    if (merged.affinity_mode === "EXPLICIT" && !merged.affinity_id)
      throw fail("Escolha a afinidade explícita.");
    for (const name of ["added_damage_pct", "imbue_damage_pct"])
      bounded(Number(merged[name]), 0, 500, name);
    if (
      (Number(merged.added_damage_pct) > 0 && !merged.added_affinity_id) ||
      (Number(merged.imbue_damage_pct) > 0 && !merged.imbue_affinity_id)
    )
      throw fail("Escolha a afinidade do componente adicional/encantamento.");
    bounded(Number(merged.defensive_received_pct), -95, 400, "Buff defensivo");
    if (
      Number(merged.defensive_received_pct) !== 0 &&
      !merged.defensive_affinity_id
    )
      throw fail("Escolha a afinidade defensiva.");
    if (
      !Number.isInteger(merged.defensive_duration_turns) ||
      merged.defensive_duration_turns < 0 ||
      merged.defensive_duration_turns > 100
    )
      throw fail("Duração defensiva inválida.");
    if (
      !Number.isInteger(merged.imbue_duration_turns) ||
      merged.imbue_duration_turns < 0 ||
      merged.imbue_duration_turns > 100
    )
      throw fail("Duração inválida.");
  }
  if (group === "monster") {
    await reference(M.MonsterFamily, merged.monster_family_id, transaction);
    await reference(
      M.CombatAffinityProfile,
      merged.affinity_profile_id,
      transaction,
    );
    if (!["Fisico", "Magico"].includes(merged.basic_attack_nature))
      throw fail("Natureza inválida.");
  }
  const explicit =
    group === "monster"
      ? merged.basic_attack_affinity_id
      : merged.affinity_mode === "EXPLICIT"
        ? merged.affinity_id
        : null;
  if (explicit) {
    const a = await reference(M.DamageAffinityType, explicit, transaction);
    const nature =
      group === "power"
        ? merged.tipo_dano
        : group === "monster"
          ? merged.basic_attack_nature
          : (merged.damage_nature_override ??
            (
              await M.WeaponType.findByPk(merged.weapon_type_id, {
                transaction,
              })
            )?.default_damage_nature ??
            merged.tipo_dano);
    if (a.categoria !== (nature === "Fisico" ? "PHYSICAL" : "ELEMENTAL"))
      throw fail("Afinidade incompatível com a natureza.");
  }
  for (const key of [
    "native_element_id",
    "added_affinity_id",
    "imbue_affinity_id",
  ])
    if (
      merged[key] &&
      (await reference(M.DamageAffinityType, merged[key], transaction))
        .categoria !== "ELEMENTAL"
    )
      throw fail("Componente adicional deve ser elemental.");
  return fields;
}
async function saveEntity(req, kind, key) {
  const model = entities[kind];
  if (!model) throw fail("Entidade inválida.");
  return audited(req, model.name, key, async (transaction) => {
    const row = await model.findByPk(key, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!row) throw fail("Registro não encontrado.");
    const before = {
      ...row.toJSON(),
      ...(await entityRelations(kind, key, transaction)),
    };
    const values = await validateEntity(
      kind,
      req.body.values ?? {},
      row,
      transaction,
    );
    await row.update(values, { transaction });
    if ("familyBonuses" in req.body) {
      if (!["weapons", "powers"].includes(kind))
        throw fail("Especialização inválida.");
      await replaceRows(
        kind === "weapons" ? M.WeaponFamilyBonus : M.PowerFamilyBonus,
        kind === "weapons" ? "item_id" : "power_id",
        key,
        req.body.familyBonuses,
        "monster_family_id",
        "damage_bonus_pct",
        M.MonsterFamily,
        0,
        500,
        transaction,
      );
    }
    if ("modifiers" in req.body) {
      if (kind !== "equipment") throw fail("Modificador inválido.");
      if (
        ![
          "Arma",
          "Armadura",
          "Capacete",
          "Escudo",
          "Acessorio1",
          "Acessorio2",
        ].includes(row.tipo_item)
      )
        throw fail("Somente equipamentos recebem modificadores.");
      await replaceRows(
        M.EquipmentAffinityModifier,
        "id_item",
        key,
        req.body.modifiers,
        "id_affinity",
        "received_damage_pct",
        M.DamageAffinityType,
        -95,
        400,
        transaction,
      );
    }
    return {
      before,
      after: {
        ...row.toJSON(),
        ...(await entityRelations(kind, key, transaction)),
      },
    };
  });
}
function validateConfig(values) {
  const merged = { ...typing.config(), ...values };
  for (const k of Object.keys(values))
    if (!(k in typing.defaults)) throw fail("Configuração desconhecida.");
  if (typeof merged.pve_enabled !== "boolean" || merged.pvp_enabled !== false)
    throw fail("PvP deve permanecer desativado na V1.");
  for (const k of [
    "min_multiplier",
    "max_multiplier",
    "effective_min",
    "weakened_max",
    "ineffective_max",
  ])
    bounded(merged[k], 0.01, 5, k);
  bounded(merged.family_bonus_cap, 0, 500, "Cap de família");
  if (
    !(
      merged.min_multiplier <= 1 &&
      merged.max_multiplier >= 1 &&
      merged.ineffective_max < merged.weakened_max &&
      merged.weakened_max < 1 &&
      merged.effective_min > 1
    )
  )
    throw fail("Caps/faixas inconsistentes.");
  if (
    !merged.labels ||
    ["effective", "neutral", "weakened", "ineffective"].some(
      (k) =>
        typeof merged.labels[k] !== "string" ||
        !merged.labels[k].trim() ||
        merged.labels[k].length > 30,
    )
  )
    throw fail("Labels inválidos.");
  return merged;
}
async function saveConfig(req) {
  const values = validateConfig(req.body.values ?? {});
  await audited(req, "CombatTypingConfig", null, async (transaction) => {
    const before = typing.config();
    await Setting.upsert(
      {
        chave: "combat_typing.config",
        valor: values,
        tipo: "json",
        editavel_admin: true,
        updated_by_admin_id: req.user.id,
      },
      { transaction },
    );
    return { before, after: values };
  });
  await require("./gameSettingCache").recarregar();
  return values;
}
async function simulate(body) {
  const amount = bounded(body.amount, 0, 100000000, "Dano bruto");
  await typing.catalog();
  let actor = {},
    target = {},
    power = null;
  if (body.characterId) {
    const c = await require("../models/Character").findByPk(
      id(body.characterId),
    );
    if (!c) throw fail("Personagem não encontrado.");
    actor = require("./equipmentBonusService").personagemComBonus(
      c.toJSON(),
      await require("./equipmentBonusService").buscarBonusDeAtributos(c.id),
    );
  } else if (body.weaponId) {
    const w = await entities.weapons.findByPk(id(body.weaponId));
    if (!w) throw fail("Arma não encontrada.");
    actor = {
      arma_equipada: w.toJSON(),
      combatTyping: { weapon: typing.weaponProfile(w.toJSON()) },
    };
  }
  if (body.powerId) {
    power = await entities.powers.findByPk(id(body.powerId));
    if (!power) throw fail("Power não encontrada.");
    power = power.toJSON();
  }
  if (body.targetKind && body.targetId) {
    if (!["monsters", "guild-bosses", "world-bosses"].includes(body.targetKind))
      throw fail("Alvo inválido.");
    const row = await entities[body.targetKind].findByPk(id(body.targetId));
    if (!row) throw fail("Alvo não encontrado.");
    target = { ...row.toJSON(), combatTyping: typing.monsterProfile(row) };
  }
  return typing.resolveDamage({ amount, actor, target, power, context: "PVE" });
}
module.exports = {
  catalogs,
  entities,
  listCatalog,
  saveCatalog,
  listEntities,
  detail,
  saveEntity,
  saveConfig,
  simulate,
  validateConfig,
  id,
};

async function catalogRelations(kind, id, transaction) {
  if (kind === "profiles")
    return {
      entries: await M.CombatAffinityProfileEntry.findAll({
        where: { id_profile: id },
        raw: true,
        transaction,
      }),
    };
  if (kind === "weapons")
    return {
      familyBonuses: await M.WeaponTypeFamilyBonus.findAll({
        where: { weapon_type_id: id },
        raw: true,
        transaction,
      }),
    };
  return {};
}
async function entityRelations(kind, id, transaction) {
  if (kind === "weapons")
    return {
      familyBonuses: await M.WeaponFamilyBonus.findAll({
        where: { item_id: id },
        raw: true,
        transaction,
      }),
    };
  if (kind === "powers")
    return {
      familyBonuses: await M.PowerFamilyBonus.findAll({
        where: { power_id: id },
        raw: true,
        transaction,
      }),
    };
  if (kind === "equipment")
    return {
      modifiers: await M.EquipmentAffinityModifier.findAll({
        where: { id_item: id },
        raw: true,
        transaction,
      }),
    };
  return {};
}
