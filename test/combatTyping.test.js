const { bancoDisponivel, sequelize, criarPersonagem } = require("./helpers/db");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const M = require("../src/models/combatTypingModels");
const typing = require("../src/services/combatTypingService");
const admin = require("../src/services/combatTypingAdminService");
const F = require("../src/services/combatFormulas");
const cache = require("../src/services/gameSettingCache");
const available = bancoDisponivel();
function actor() {
  return {
    id: 123,
    forca: 20,
    inteligencia: 80,
    nivel: 10,
    agilidade: 0,
    velocidade: 0,
    vida_atual: 10000,
    mana_atual: 10000,
    multiplicador_dano_fisico: 1.2,
    multiplicador_dano_magico: 1.5,
    arma_equipada: { dano_min: 10, dano_max: 20 },
    combatTyping: { weapon: { nature: "Fisico", affinityId: 1 } },
  };
}
async function ready(t) {
  if (!(await available)) {
    t.skip("Postgres indisponível");
    return false;
  }
  await typing.catalog();
  return true;
}
test("neutral resolver exactly preserves legacy mitigation/rounding across 500 snapshots", async (t) => {
  if (!(await ready(t))) return;
  for (let i = 1; i <= 500; i++) {
    const a = actor(),
      target = { defesa: i % 135 },
      amount = i * 1.31,
      finalMultiplier = ((i % 3) + 8) / 10;
    const legacy = Math.max(
      1,
      Math.round(F.aplicarMitigacaoDeDefesa(amount, target) * finalMultiplier),
    );
    assert.equal(
      typing.resolveDamage({ amount, actor: a, target, finalMultiplier })
        .totalDamage,
      legacy,
    );
  }
});
test("physical basic RNG/class/critical are unchanged; magical basic respects intelligence and magical class", async (t) => {
  if (!(await ready(t))) return;
  t.mock.method(Math, "random", () => 0.8);
  const a = actor();
  assert.equal(
    typing.basicDamage(a, {}, new Map(), "PVE"),
    F.calcularDanoBasico(a),
  );
  a.combatTyping.weapon.nature = "Magico";
  assert.equal(
    typing.basicDamage(a),
    F.calcularDanoBasico({
      ...a,
      forca: a.inteligencia,
      multiplicador_dano_fisico: a.multiplicador_dano_magico,
    }),
  );
  assert.notEqual(typing.basicDamage(a), F.calcularDanoBasico(a));
  assert.equal(
    typing.basicDamage(a, {}, new Map(), "PVP_CASUAL"),
    F.calcularDanoBasico(a),
  );
});
test("catalog seeds/backfill use catalogs without removing the weapon enum or altering legacy nature", async (t) => {
  if (!(await ready(t))) return;
  const c = await typing.catalog();
  assert.equal(c.DamageAffinityType.filter((x) => x.ativo).length >= 11, true);
  assert.equal(c.MonsterFamily.length >= 10, true);
  assert.equal(c.WeaponType.length >= 9, true);
  const [rows] = await sequelize.query(
    'SELECT COUNT(*)::int AS n FROM "WeaponProperties" WHERE tipo_arma IS NOT NULL AND (weapon_type_id IS NULL OR damage_nature_override IS DISTINCT FROM tipo_dano::text)',
  );
  assert.equal(rows[0].n, 0);
  const [powers] = await sequelize.query(
    "SELECT COUNT(*)::int AS n FROM \"Powers\" WHERE tipo_dano::text='Fisico' AND affinity_mode<>'INHERIT_WEAPON'",
  );
  assert.equal(powers[0].n, 0);
});
test("profile default/override, thresholds, true and no-damage semantics", async (t) => {
  if (!(await ready(t))) return;
  const c = await typing.catalog(),
    fire = c.DamageAffinityType.find((a) => a.key === "FIRE");
  const target = {
    defesa: 500,
    combatTyping: { multipliers: { [fire.id]: 0.5 } },
  };
  const power = {
    tipo_dano: "Magico",
    affinity_mode: "EXPLICIT",
    affinity_id: fire.id,
  };
  const r = typing.resolveDamage({ amount: 200, target, power });
  assert.equal(r.components[0].affinityMultiplier, 0.5);
  assert.equal(r.components[0].effectivenessLabel, "INEFICAZ");
  assert.equal(typing.classification(1.15), "EFETIVO");
  assert.equal(typing.classification(0.9), "ENFRAQUECIDO");
  assert.equal(typing.classification(0.91), "NEUTRO");
  assert.equal(
    typing.resolveDamage({
      amount: 200,
      target,
      power: { tipo_dano: "Verdadeiro" },
    }).totalDamage,
    200,
  );
  assert.equal(
    typing.resolveDamage({
      amount: 200,
      target,
      power: { tipo_dano: "Nenhum" },
    }).totalDamage,
    0,
  );
  assert.equal(
    typing.resolveDamage({
      amount: 200,
      target,
      power: { tipo_dano: "Magico", affinity_mode: "NEUTRAL" },
    }).components[0].affinityMultiplier,
    1,
  );
});
test("inherit/explicit Power and distinct native/imbue components are resolved independently", async (t) => {
  if (!(await ready(t))) return;
  const c = await typing.catalog(),
    slash = c.DamageAffinityType.find((a) => a.key === "SLASH"),
    fire = c.DamageAffinityType.find((a) => a.key === "FIRE"),
    blunt = c.DamageAffinityType.find((a) => a.key === "BLUNT");
  const a = actor();
  a.combatTyping.weapon = {
    nature: "Fisico",
    affinityId: slash.id,
    nativeElementId: fire.id,
    elementalPct: 25,
  };
  const target = {
    defesa: 0,
    combatTyping: { multipliers: { [slash.id]: 0.75, [fire.id]: 1.5 } },
  };
  assert.equal(
    typing.attackProfile(a, {
      tipo_dano: "Fisico",
      affinity_mode: "INHERIT_WEAPON",
    }).affinityId,
    slash.id,
  );
  assert.equal(
    typing.attackProfile(a, {
      tipo_dano: "Fisico",
      affinity_mode: "EXPLICIT",
      affinity_id: blunt.id,
    }).affinityId,
    blunt.id,
  );
  const r = typing.resolveDamage({ amount: 120, actor: a, target });
  assert.equal(r.components.length, 2);
  assert.equal(r.totalDamage, 90 + 45);
  const imbue = typing.resolveDamage({
    amount: 120,
    actor: a,
    target,
    buffs: [{ effectKey: "WEAPON_IMBUE", affinityId: fire.id, magnitude: 25 }],
  });
  assert.equal(imbue.components.length, 3);
  assert.equal(imbue.totalDamage, 180);
});
test("defensive equipment aggregates signed percentages, caps and recalculates after unequip", async (t) => {
  if (!(await ready(t))) return;
  const Item = require("../src/models/Item"),
    c = await typing.catalog(),
    fire = c.DamageAffinityType.find((a) => a.key === "FIRE");
  const a = await Item.create({
    nome: `Typing armor ${Date.now()}`,
    descricao: "fixture",
    tipo_item: "Armadura",
    raridade: "Comum",
    preco_venda: 1,
    preco_compra: 1,
  });
  await M.EquipmentAffinityModifier.create({
    id_item: a.id,
    id_affinity: fire.id,
    received_damage_pct: -95,
  });
  typing.invalidate();
  const equipped = await typing.equipmentProfile([a.id], null);
  assert.equal(equipped.multipliers[fire.id], 0.050000000000000044);
  assert.equal(
    (await typing.equipmentProfile([], null)).multipliers[fire.id],
    undefined,
  );
  assert.equal(
    typing.defensiveMultiplier(
      { combatTyping: { multipliers: { [fire.id]: -5 } } },
      fire.id,
    ),
    0.05,
  );
  await M.EquipmentAffinityModifier.destroy({ where: { id_item: a.id } });
  await a.destroy();
  typing.invalidate();
});
test("family default inheritance and item/type/Power specialization add then cap", async (t) => {
  if (!(await ready(t))) return;
  const c = await typing.catalog(),
    slash = c.DamageAffinityType.find((a) => a.key === "SLASH");
  const unique = Date.now();
  const profile = await M.CombatAffinityProfile.create({
    key: `TEST_PROFILE_${unique}`,
    nome: "Profile",
  });
  await M.CombatAffinityProfileEntry.create({
    id_profile: profile.id,
    id_affinity: slash.id,
    multiplier: 0.75,
  });
  const override = await M.CombatAffinityProfile.create({
    key: `TEST_OVERRIDE_${unique}`,
    nome: "Override",
  });
  await M.CombatAffinityProfileEntry.create({
    id_profile: override.id,
    id_affinity: slash.id,
    multiplier: 1.25,
  });
  const family = await M.MonsterFamily.create({
    key: `TEST_FAMILY_${unique}`,
    nome: "Family",
    default_affinity_profile_id: profile.id,
  });
  const type = c.WeaponType.find((w) => w.key === "HAMMER");
  await M.WeaponTypeFamilyBonus.create({
    weapon_type_id: type.id,
    monster_family_id: family.id,
    damage_bonus_pct: 70,
  });
  typing.invalidate();
  await typing.catalog();
  assert.equal(
    typing.monsterProfile({ monster_family_id: family.id }).multipliers[
      slash.id
    ],
    0.75,
  );
  assert.equal(
    typing.monsterProfile({
      monster_family_id: family.id,
      affinity_profile_id: override.id,
    }).multipliers[slash.id],
    1.25,
  );
  const a = actor();
  a.arma_equipada.weapon_type_id = type.id;
  const target = {
    combatTyping: typing.monsterProfile({ monster_family_id: family.id }),
  };
  const r = typing.resolveDamage({ amount: 100, actor: a, target });
  assert.equal(r.components[0].familyBonusPct, 50);
  await M.WeaponTypeFamilyBonus.destroy({
    where: { monster_family_id: family.id },
  });
  await family.destroy();
  await M.CombatAffinityProfileEntry.destroy({
    where: { id_profile: [profile.id, override.id] },
  });
  await profile.destroy();
  await override.destroy();
  typing.invalidate();
});
test("PvP contexts ignore affinity, components, family bonuses and enchanted weapons", async (t) => {
  if (!(await ready(t))) return;
  const a = actor();
  a.combatTyping.weapon = {
    nature: "Magico",
    affinityId: 1,
    nativeElementId: 4,
    elementalPct: 300,
  };
  for (const context of ["PVP_CASUAL", "RANKED", "TOURNAMENT"]) {
    const r = typing.resolveDamage({
      amount: 100,
      actor: a,
      target: {
        defesa: 100,
        combatTyping: { family: { id: 1 }, multipliers: { 1: 3 } },
      },
      context,
      buffs: [{ effectKey: "WEAPON_IMBUE", affinityId: 4, magnitude: 25 }],
    });
    assert.equal(r.components.length, 1);
    assert.equal(r.components[0].affinityMultiplier, 1);
    assert.equal(r.components[0].familyBonusPct, 0);
    assert.equal(
      r.totalDamage,
      Math.max(1, Math.round(F.aplicarMitigacaoDeDefesa(100, { defesa: 100 }))),
    );
  }
});
test("all PvE contexts use the same damage order including native weapon bonuses", async (t) => {
  if (!(await ready(t))) return;
  const a = actor();
  a.combatTyping.weapon = {
    nature: "Fisico",
    affinityId: 1,
    nativeElementId: 4,
    elementalPct: 20,
  };
  const target = {
    defesa: 100,
    combatTyping: { multipliers: { 1: 0.75, 4: 1.5 } },
  };
  const expected = typing.resolveDamage({ amount: 100, actor: a, target });
  for (const context of ["PVE", "PARTY", "GUILD_BOSS", "WORLD_BOSS"])
    assert.deepEqual(
      typing.resolveDamage({ amount: 100, actor: a, target, context }),
      expected,
    );
});
test("config validation forbids PvP V1, unsafe caps, inverted bands and invalid labels", () => {
  assert.throws(() => admin.validateConfig({ pvp_enabled: true }));
  assert.throws(() => admin.validateConfig({ min_multiplier: 0 }));
  assert.throws(() => admin.validateConfig({ weakened_max: 1.2 }));
  assert.throws(() => admin.validateConfig({ labels: {} }));
  assert.equal(
    admin.validateConfig({ family_bonus_cap: 40 }).family_bonus_cap,
    40,
  );
});
test("production action engine forwards every PvE context and preserves PvP neutral behavior",async t=>{
 if(!await ready(t))return;t.mock.method(Math,"random",()=>0.99);
 const core=require("../src/services/combatActionEngine"),fire=(await typing.catalog()).DamageAffinityType.find(a=>a.key==="FIRE");
 const power={id:991,tipo_dano:"Magico",tipo_poder:"Ativo",nome:"Typed",dano_base:100,cura_base:0,custo_mana:0,escala_atributo:"Inteligencia",valor_escala:0,affinity_mode:"EXPLICIT",affinity_id:fire.id};
 for(const context of ["PVE","PARTY","GUILD_BOSS","WORLD_BOSS","PVP_CASUAL","RANKED","TOURNAMENT"]){const a={...actor(),nivel:1};const target={id:992,defesa:0,agilidade:0,vida_atual:10000,mana_atual:0,combatTyping:{multipliers:{[fire.id]:0.75}}};const result=core.aplicarAcao({atacante:a,defensor:target,acao:{tipo:"power",power},contexto:context});assert.equal(result.damageResolution.components[0].affinityMultiplier,/PVP|RANKED|TOURNAMENT/.test(context)?1:0.75);assert.equal(target.vida_atual,10000-result.dano);}
});
test("typed offensive/defensive buffs retain duration and use the same capped defense resolver",async t=>{
 if(!await ready(t))return;const fire=(await typing.catalog()).DamageAffinityType.find(a=>a.key==="FIRE");const buffs=typing.applyPowerBuffs([],{id:12,imbue_affinity_id:fire.id,imbue_damage_pct:25,imbue_duration_turns:3,defensive_affinity_id:fire.id,defensive_received_pct:-20,defensive_duration_turns:3});assert.equal(buffs.length,2);const dec=require("../src/services/combatBuffService").decrementarDuracoes(buffs);assert.equal(dec[0].remainingTurns,3);assert.equal(typing.defensiveMultiplier({},fire.id,dec),0.8);const a=actor();const result=typing.resolveDamage({amount:100,actor:a,target:{combatAffinityBuffs:dec},buffs:dec});assert.equal(result.components.length,2);assert.equal(result.components[1].finalDamage,20);
});
test("administrative item clone retains typed components, specialization and resistances atomically",async t=>{
 if(!await ready(t))return;const {usuario}=await criarPersonagem({isAdmin:true});const Item=require("../src/models/Item"),Weapon=require("../src/models/WeaponProperties"),c=await typing.catalog(),fire=c.DamageAffinityType.find(a=>a.key==="FIRE"),family=c.MonsterFamily.find(f=>f.key==="CONSTRUCT");
 const item=await Item.create({nome:`Typed clone ${Date.now()}`,descricao:"Fixture",tipo_item:"Arma",raridade:"Comum"});await Weapon.create({id_item:item.id,tipo_arma:"Espada",tipo_dano:"Fisico",dano_min:10,dano_max:20,bonus_atributo:"Forca",native_element_id:fire.id,elemental_damage_pct:25});await M.WeaponFamilyBonus.create({item_id:item.id,monster_family_id:family.id,damage_bonus_pct:20});await M.EquipmentAffinityModifier.create({id_item:item.id,id_affinity:fire.id,received_damage_pct:-20});
 const copy=await require("../src/services/adminItemService").duplicateAdminItem(item.id,{idAdmin:usuario.id});assert.equal(Number((await Weapon.findByPk(copy.id)).elemental_damage_pct),25);assert.equal(await M.WeaponFamilyBonus.count({where:{item_id:copy.id}}),1);assert.equal(await M.EquipmentAffinityModifier.count({where:{id_item:copy.id}}),1);
 for(const id of [item.id,copy.id]){await M.WeaponFamilyBonus.destroy({where:{item_id:id}});await M.EquipmentAffinityModifier.destroy({where:{id_item:id}});await Weapon.destroy({where:{id_item:id}});await Item.destroy({where:{id}});}typing.invalidate();
});
