const { DataTypes: D } = require("sequelize");
const { sequelize } = require("../config/database");
const id = () => ({ type: D.INTEGER, primaryKey: true, autoIncrement: true });
const ref = (table, nullable = true) => ({
  type: D.INTEGER,
  allowNull: nullable,
  references: { model: table, key: "id" },
  onDelete: "RESTRICT",
});
const catalog = () => ({
  id: id(),
  key: { type: D.STRING(60), allowNull: false, unique: true },
  nome: { type: D.STRING(120), allowNull: false },
  descricao: { type: D.TEXT },
  icon_key: { type: D.STRING(120) },
  imagem_url: { type: D.STRING(500) },
  ativo: { type: D.BOOLEAN, allowNull: false, defaultValue: true },
  ordem: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
});
const define = (name, table, fields) =>
  sequelize.define(name, fields, { tableName: table });
const DamageAffinityType = define(
  "DamageAffinityType",
  "damage_affinity_types",
  {
    ...catalog(),
    categoria: {
      type: D.STRING(20),
      allowNull: false,
      validate: { isIn: [["PHYSICAL", "ELEMENTAL"]] },
    },
  },
);
const CombatAffinityProfile = define(
  "CombatAffinityProfile",
  "combat_affinity_profiles",
  catalog(),
);
const CombatAffinityProfileEntry = define(
  "CombatAffinityProfileEntry",
  "combat_affinity_profile_entries",
  {
    id: id(),
    id_profile: ref("combat_affinity_profiles", false),
    id_affinity: ref("damage_affinity_types", false),
    multiplier: {
      type: D.DECIMAL(10, 4),
      allowNull: false,
      validate: { min: 0.05, max: 5 },
    },
  },
);
const MonsterFamily = define("MonsterFamily", "monster_families", {
  ...catalog(),
  default_affinity_profile_id: ref("combat_affinity_profiles"),
});
const WeaponType = define("WeaponType", "weapon_types", {
  ...catalog(),
  legacy_tipo_arma: { type: D.STRING(30), unique: true },
  default_damage_nature: {
    type: D.STRING(20),
    allowNull: false,
    defaultValue: "Fisico",
    validate: { isIn: [["Fisico", "Magico"]] },
  },
  default_affinity_id: ref("damage_affinity_types"),
});
const EquipmentAffinityModifier = define(
  "EquipmentAffinityModifier",
  "equipment_affinity_modifiers",
  {
    id: id(),
    id_item: ref("Items", false),
    id_affinity: ref("damage_affinity_types", false),
    received_damage_pct: {
      type: D.DECIMAL(10, 4),
      allowNull: false,
      validate: { min: -95, max: 400 },
    },
  },
);
const WeaponTypeFamilyBonus = define(
  "WeaponTypeFamilyBonus",
  "weapon_type_family_bonuses",
  {
    id: id(),
    weapon_type_id: ref("weapon_types", false),
    monster_family_id: ref("monster_families", false),
    damage_bonus_pct: {
      type: D.DECIMAL(10, 4),
      allowNull: false,
      validate: { min: 0, max: 500 },
    },
  },
);
const WeaponFamilyBonus = define("WeaponFamilyBonus", "weapon_family_bonuses", {
  id: id(),
  item_id: ref("Items", false),
  monster_family_id: ref("monster_families", false),
  damage_bonus_pct: {
    type: D.DECIMAL(10, 4),
    allowNull: false,
    validate: { min: 0, max: 500 },
  },
});
const PowerFamilyBonus = define("PowerFamilyBonus", "power_family_bonuses", {
  id: id(),
  power_id: ref("Powers", false),
  monster_family_id: ref("monster_families", false),
  damage_bonus_pct: {
    type: D.DECIMAL(10, 4),
    allowNull: false,
    validate: { min: 0, max: 500 },
  },
});
const fields = {
  weapon: {
    weapon_type_id: ref("weapon_types"),
    damage_nature_override: {
      type: D.STRING(20),
      validate: { isIn: [["Fisico", "Magico"]] },
    },
    affinity_mode: {
      type: D.STRING(20),
      allowNull: false,
      defaultValue: "INHERIT",
      validate: { isIn: [["INHERIT", "EXPLICIT", "NEUTRAL"]] },
    },
    affinity_id: ref("damage_affinity_types"),
    native_element_id: ref("damage_affinity_types"),
    elemental_damage_pct: {
      type: D.DECIMAL(10, 4),
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0, max: 500 },
    },
  },
  power: {
    defensive_affinity_id: ref("damage_affinity_types"),
    defensive_received_pct: {
      type: D.DECIMAL(10, 4),
      allowNull: false,
      defaultValue: 0,
      validate: { min: -95, max: 400 },
    },
    defensive_duration_turns: {
      type: D.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0, max: 100 },
    },
    affinity_mode: {
      type: D.STRING(20),
      allowNull: false,
      defaultValue: "NEUTRAL",
      validate: { isIn: [["INHERIT_WEAPON", "EXPLICIT", "NEUTRAL"]] },
    },
    affinity_id: ref("damage_affinity_types"),
    added_affinity_id: ref("damage_affinity_types"),
    added_damage_pct: {
      type: D.DECIMAL(10, 4),
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0, max: 500 },
    },
    imbue_affinity_id: ref("damage_affinity_types"),
    imbue_damage_pct: {
      type: D.DECIMAL(10, 4),
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0, max: 500 },
    },
    imbue_duration_turns: {
      type: D.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0, max: 100 },
    },
  },
  monster: {
    monster_family_id: ref("monster_families"),
    affinity_profile_id: ref("combat_affinity_profiles"),
    basic_attack_nature: {
      type: D.STRING(20),
      allowNull: false,
      defaultValue: "Fisico",
      validate: { isIn: [["Fisico", "Magico"]] },
    },
    basic_attack_affinity_id: ref("damage_affinity_types"),
  },
};
module.exports = {
  DamageAffinityType,
  WeaponType,
  MonsterFamily,
  CombatAffinityProfile,
  CombatAffinityProfileEntry,
  EquipmentAffinityModifier,
  WeaponTypeFamilyBonus,
  WeaponFamilyBonus,
  PowerFamilyBonus,
  fields,
};
