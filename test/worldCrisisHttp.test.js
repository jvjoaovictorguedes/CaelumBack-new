const test = require("node:test"),
  assert = require("node:assert/strict");
const { sequelize, bancoDisponivel, criarPersonagem } = require("./helpers/db");
const M = require("../src/models/worldCrisisModels");
const Item = require("../src/models/Item");
let ready;
test.before(async () => {
  ready = await bancoDisponivel();
});
test.after(() => sequelize.close());
test("crisis HTTP permission split, validated catalogs, audit and inactive snapshot preview", async (t) => {
  if (!ready) return t.skip("Requires local Postgres");
  const admin = await criarPersonagem({ isAdmin: true }),
    user = await criarPersonagem();
  const item = await Item.create({
    nome: `Item crise HTTP ${Date.now()}`,
    descricao: "teste",
    tipo_item: "Material",
    raridade: "Comum",
  });
  const app = require("express")();
  app.use(require("express").json());
  app.use(
    "/api/admin/world-crisis",
    require("../src/routes/adminWorldCrisisRoutes"),
  );
  app.use("/api/world-crisis", require("../src/routes/worldCrisisRoutes"));
  const server = require("node:http").createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
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
  let configId;
  t.after(async () => {
    await new Promise((r) => server.close(r));
    if (configId) await M.Config.destroy({ where: { id: configId } });
    await Item.destroy({ where: { id: item.id } });
  });
  assert.equal(
    (await request("admin/world-crisis/configs", "GET", null, user.usuario.id))
      .status,
    403,
  );
  assert.equal((await request("admin/world-crisis/configs")).status, 403);
  await sequelize.query(
    `INSERT INTO user_admin_roles (id_user,id_role,"createdAt","updatedAt") SELECT :user,id,NOW(),NOW() FROM admin_roles WHERE nome='SuperAdmin' ON CONFLICT DO NOTHING`,
    { replacements: { user: admin.usuario.id } },
  );
  const structure = {
    key: `HTTP_${Date.now()}`,
    nome: "Crise HTTP",
    stages: [
      {
        key: "CIDADE",
        nome: "Cidade",
        requirements: [
          {
            key: "MADEIRA",
            nome: "Madeira",
            target_progress: 100,
            mandatory: true,
            sources: [
              {
                source_type: "ITEM",
                source_id: item.id,
                progress_per_unit: 1,
                ranking_points_per_unit: 1,
              },
            ],
          },
        ],
        effects: [
          {
            effect_key: "PVE_XP_PENALTY_PCT",
            magnitude: 10,
            contexts: ["ADVENTURE_SOLO"],
          },
        ],
      },
    ],
    restrictions: [],
    guild_scoring_config: {
      minimum_contributors_for_bonus: 5,
      tiers: [{ min_pct: 0, multiplier: 1 }],
    },
    rewards: [
      {
        key: "AJUDA",
        scope: "PARTICIPATION",
        min_points: 10,
        payload: [{ type: "CHARACTER_GOLD", quantity: 10 }],
      },
    ],
  };
  assert.equal(
    (
      await request("admin/world-crisis/configs", "POST", {
        structure,
        ativo: false,
      })
    ).status,
    400,
  );
  const saved = await request("admin/world-crisis/configs", "POST", {
    structure,
    ativo: false,
    reason: "Criar perfil para testar",
  });
  assert.equal(saved.status, 200);
  configId = (await saved.json()).data.id;
  const invalid = { ...structure, stages: [] };
  assert.equal(
    (
      await request(`admin/world-crisis/configs/${configId}`, "PUT", {
        structure: invalid,
        ativo: true,
        reason: "Perfil inválido",
      })
    ).status,
    400,
  );
  assert.equal((await M.Config.findByPk(configId)).ativo, false);
  const preview = await request(
    `admin/world-crisis/configs/${configId}/preview`,
    "POST",
  );
  assert.equal(preview.status, 200);
  const data = (await preview.json()).data;
  assert.ok(data.warnings.length);
  assert.equal(
    data.structure.stages[0].requirements[0].resolved_items[0].id,
    item.id,
  );
  const forbidden = {
    ...structure,
    rewards: [
      {
        key: "EXEC",
        scope: "PARTICIPATION",
        min_points: 1,
        payload: [{ type: "JAVASCRIPT", quantity: 1 }],
      },
    ],
  };
  assert.equal(
    (
      await request("admin/world-crisis/configs", "POST", {
        structure: forbidden,
        reason: "Prêmio inválido",
      })
    ).status,
    400,
  );
  const log = await require("../src/models/AdminActionLog").findOne({
    where: { acao: "worldcrisis.config.save", id_admin: admin.usuario.id },
  });
  assert.equal(
    log.dados_depois.structure.stages[0].requirements[0].sources[0].source_id,
    item.id,
  );
  assert.equal(
    (await request("world-crisis/status", "GET", null, user.usuario.id)).status,
    200,
  );
  assert.equal(
    (
      await request(
        "world-crisis/contribute",
        "POST",
        {
          event_id: 9999999,
          item_id: item.id,
          quantity: -1,
          request_id: "request_123456789",
        },
        user.usuario.id,
      )
    ).status,
    400,
  );
  const sim = await request(
    `admin/world-crisis/configs/${configId}/simulate-guild-scoring`,
    "POST",
    {
      raw_points: 1000,
      unique_contributors: 5,
      member_count_snapshot: 10,
      existed_at_start: false,
    },
  );
  assert.equal(sim.status, 200);
  assert.equal((await sim.json()).data.mobilization_multiplier, 1);
});
