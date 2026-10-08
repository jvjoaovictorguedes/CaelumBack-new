const { bancoDisponivel, criarPersonagem, sequelize } = require("./helpers/db");
const test = require("node:test"),
  assert = require("node:assert/strict");
const M = require("../src/models/combatTypingModels");
let available = false;
test.before(async () => {
  available = await bancoDisponivel();
});
test.after(() => sequelize.close());
test("typing HTTP: permissions, catalog CRUD, atomic profile validation, auditing and real simulator", async (t) => {
  if (!available) return t.skip("Requires local Postgres");
  const user = await criarPersonagem(),
    admin = await criarPersonagem({ isAdmin: true });
  const app = require("express")();
  app.use(require("express").json());
  app.use(
    "/api/admin/combat-typing",
    require("../src/routes/adminCombatTypingRoutes"),
  );
  app.use("/api/combat-typing", require("../src/routes/combatTypingRoutes"));
  const server = require("node:http").createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const jwt = require("jsonwebtoken"),
    secret = require("../src/config/jwt").JWT_SECRET;
  const request = (path, method = "GET", body, who = admin.usuario.id) =>
    fetch(`http://127.0.0.1:${server.address().port}/api/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${jwt.sign({ id: who, proposito: "session" }, secret)}`,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  assert.equal(
    (await request("admin/combat-typing", "GET", null, user.usuario.id)).status,
    403,
  );
  assert.equal((await request("admin/combat-typing")).status, 403);
  await sequelize.query(
    'INSERT INTO user_admin_roles (id_user,id_role,"createdAt","updatedAt") SELECT :user,id,NOW(),NOW() FROM admin_roles WHERE nome=\'SuperAdmin\' ON CONFLICT DO NOTHING',
    { replacements: { user: admin.usuario.id } },
  );
  const list = await request("admin/combat-typing");
  assert.equal(list.status, 200);
  const c = (await list.json()).data.catalogs,
    fire = c.DamageAffinityType.find((a) => a.key === "FIRE");
  const unique = Date.now();
  const body = {
    reason: "Teste de catálogo",
    values: { key: `HTTP_PROFILE_${unique}`, nome: "Perfil HTTP" },
    entries: [{ id_affinity: fire.id, multiplier: 0.75 }],
  };
  const created = await request(
    "admin/combat-typing/catalog/profiles",
    "POST",
    body,
  );
  assert.equal(created.status, 200);
  const profile = (await created.json()).data;
  assert.equal(profile.entries.length, 1);
  const invalid = await request(
    `admin/combat-typing/catalog/profiles/${profile.id}`,
    "PUT",
    {
      reason: "Teste inválido",
      values: { nome: "Não deve salvar" },
      entries: [{ id_affinity: fire.id, multiplier: -1 }],
    },
  );
  assert.equal(invalid.status, 400);
  assert.equal(
    (await M.CombatAffinityProfile.findByPk(profile.id)).nome,
    "Perfil HTTP",
  );
  assert.equal(
    Number(
      (
        await M.CombatAffinityProfileEntry.findOne({
          where: { id_profile: profile.id },
        })
      ).multiplier,
    ),
    0.75,
  );
  assert.equal(
    (await request("admin/combat-typing/catalog/profiles", "POST", body))
      .status,
    400,
  );
  const audit = await require("../src/models/AdminActionLog").findOne({
    where: { id_admin: admin.usuario.id, entidade: "CombatAffinityProfile" },
  });
  assert.equal(audit.dados_depois.entries.length, 1);
  const Monster = require("../src/models/AdventureMonster");
  const monster = await Monster.create({
    nome: `HTTP Typed ${unique}`,
    affinity_profile_id: profile.id,
    vida_maxima: 100,
    nivel: 1,
    dano_min: 1,
    dano_max: 1,
  });
  const Power = require("../src/models/Power");
  const power = await Power.create({
    nome: `HTTP Fire ${unique}`,
    descricao: "fixture",
    tipo_poder: "Ativo",
    tipo_dano: "Magico",
    affinity_mode: "EXPLICIT",
    affinity_id: fire.id,
    escala_atributo: "Inteligencia",
    dano_base: 100,
  });
  const sim = await request("admin/combat-typing/simulate", "POST", {
    amount: 100,
    powerId: power.id,
    targetKind: "monsters",
    targetId: monster.id,
  });
  assert.equal(sim.status, 200);
  const result = (await sim.json()).data;
  assert.equal(result.totalDamage, 75);
  assert.equal(result.components[0].affinity.nome, "Fogo");
  assert.equal(result.components[0].effectivenessLabel, "ENFRAQUECIDO");
  assert.equal(
    (
      await request("admin/combat-typing/config", "PUT", {
        reason: "Teste de segurança",
        values: { pvp_enabled: true },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`admin/combat-typing/entities/powers/${power.id}`, "PUT", {
        reason: "Teste incompatível",
        values: { affinity_mode: "INHERIT_WEAPON" },
      })
    ).status,
    400,
  );
  const [referenceError] = await Promise.allSettled([
    M.CombatAffinityProfile.destroy({ where: { id: profile.id } }),
  ]);
  assert.equal(referenceError.status, "rejected");
  const normal = await request(
    `combat-typing/powers/${power.id}`,
    "GET",
    null,
    user.usuario.id,
  );
  assert.equal(normal.status, 200);
  assert.equal((await normal.json()).data.affinity.nome, "Fogo");
  const Item=require("../src/models/Item"),Armor=require("../src/models/ArmorProperties"),Equipment=require("../src/models/CharacterEquipment");
  const gear=[];
  for(const [label,slot,pct] of [["old-boots","Pes",-10],["helmet","Cabeca",-30],["new-boots","Pes",-20]]){const item=await Item.create({nome:`HTTP ${label} ${unique}`,descricao:"Fixture",tipo_item:"Armadura",raridade:"Comum"});await Armor.create({id_item:item.id,slot_equipamento:slot});await M.EquipmentAffinityModifier.create({id_item:item.id,id_affinity:fire.id,received_damage_pct:pct});gear.push(item);}
  await Equipment.create({id_personagem:user.personagem.id,slot:"Pes",id_item:gear[0].id});await Equipment.create({id_personagem:user.personagem.id,slot:"Cabeca",id_item:gear[1].id});require("../src/services/combatTypingService").invalidate();
  const compare=await request(`combat-typing/items/${gear[2].id}/compare`,"GET",null,user.usuario.id);assert.equal(compare.status,200);const comparison=(await compare.json()).data;assert.equal(comparison.slot,"Pes");const fireComparison=comparison.affinities.find(a=>a.id===fire.id);assert.ok(Math.abs(fireComparison.beforeMultiplier-0.6)<1e-10);assert.equal(fireComparison.multiplier,0.5);
  await Equipment.destroy({where:{id_personagem:user.personagem.id}});for(const item of gear){await M.EquipmentAffinityModifier.destroy({where:{id_item:item.id}});await Armor.destroy({where:{id_item:item.id}});await item.destroy();}
  await monster.destroy();
  await power.destroy();
  await M.CombatAffinityProfileEntry.destroy({
    where: { id_profile: profile.id },
  });
  await M.CombatAffinityProfile.destroy({ where: { id: profile.id } });
  require("../src/services/combatTypingService").invalidate();
});
