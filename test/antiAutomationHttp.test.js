const { bancoDisponivel, criarPersonagem, sequelize } = require("./helpers/db");
const test = require("node:test");
const assert = require("node:assert/strict");
const Risk = require("../src/models/AutomationRiskState");
const Challenge = require("../src/models/AutomationChallenge");
let available = false;
test.before(async () => {
  available = await bancoDisponivel();
});
test.after(() => sequelize.close());
test("HTTP: challenge gates before mutation, hides score, verifies provider server-side, and admin permissions isolate review", async (t) => {
  if (!available) return t.skip("requires local PostgreSQL");
  const { usuario, personagem } = await criarPersonagem();
  const admin = await criarPersonagem({ isAdmin: true });
  const app = require("express")();
  app.use(require("express").json());
  app.use(
    "/api/anti-automation",
    require("../src/routes/antiAutomationRoutes"),
  );
  app.use("/api/fishing", require("../src/routes/fishingRoutes"));
  app.use(
    "/api/admin/anti-automation",
    require("../src/routes/adminAntiAutomationRoutes"),
  );
  const server = require("node:http").createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const jwt = require("jsonwebtoken"),
    secret = require("../src/config/jwt").JWT_SECRET;
  const token = (id) =>
    jwt.sign({ id, proposito: "session" }, secret, { expiresIn: "1m" });
  const request = (path, method = "GET", body, user = usuario.id) =>
    fetch(`http://127.0.0.1:${server.address().port}/api/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token(user)}`,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  await Risk.create({
    id_personagem: personagem.id,
    score: 100,
    signal_families: ["ACTION_REPLAY", "INVALID_STATE"],
  });
  assert.equal((await request("admin/anti-automation")).status, 403);
  assert.equal(
    (await request("admin/anti-automation", "GET", null, admin.usuario.id))
      .status,
    403,
  );
  const saved = {};
  for (const key of [
    "TURNSTILE_SECRET_KEY",
    "TURNSTILE_SITE_KEY",
    "TURNSTILE_HOSTNAMES",
  ]) {
    saved[key] = process.env[key];
    process.env[key] =
      key === "TURNSTILE_HOSTNAMES" ? "localhost" : "test-only";
  }
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const cache = require("../src/services/gameSettingCache");
  t.mock.method(cache, "obter", (key, value) =>
    key === "anti_automation.shadow_mode"
      ? false
      : key === "anti_automation.challenge_enabled"
        ? true
        : value,
  );
  const blocked = await request("fishing/sessions/start", "POST", {});
  assert.equal(blocked.status, 403);
  const error = await blocked.json();
  assert.equal(error.code, "ANTI_AUTOMATION_CHALLENGE_REQUIRED");
  assert.equal(error.score, undefined);
  assert.equal(
    await require("../src/models/FishingSession").count({
      where: { id_personagem: personagem.id },
    }),
    0,
  );
  const issued = await (await request("anti-automation/status")).json();
  assert.equal(issued.data.required, true);
  assert.equal(issued.data.score, undefined);
  const originalFetch = global.fetch;
  let siteverifyCalls = 0;
  t.mock.method(global, "fetch", async (url, options) => {
    if (String(url).startsWith("https://challenges.cloudflare.com/")) {
      siteverifyCalls++;
      assert.equal(options.body.get("secret"), "test-only");
      return new Response(
        JSON.stringify({
          success: true,
          hostname: "localhost",
          action: "caelum-verify",
          cdata: issued.data.challengeId,
        }),
        { status: 200 },
      );
    }
    return originalFetch(url, options);
  });
  const verified = await request("anti-automation/verify", "POST", {
    challengeId: issued.data.challengeId,
    token: "mock-provider-token",
  });
  assert.equal(verified.status, 200);
  assert.equal((await verified.json()).data.verified, true);
  assert.equal(siteverifyCalls, 1);
  assert.equal(
    (
      await request("anti-automation/verify", "POST", {
        challengeId: issued.data.challengeId,
        token: "mock-provider-token",
      })
    ).status,
    409,
  );
  assert.equal(siteverifyCalls, 1);
  assert.equal(
    JSON.stringify(
      (await Challenge.findByPk(issued.data.challengeId)).toJSON(),
    ).includes("mock-provider-token"),
    false,
  );
  // Grant SuperAdmin explicitly; successful review must create an audit record.
  await sequelize.query(
    'INSERT INTO user_admin_roles (id_user,id_role,"createdAt","updatedAt") SELECT :id,id,NOW(),NOW() FROM admin_roles WHERE nome=\'SuperAdmin\' ON CONFLICT DO NOTHING',
    { replacements: { id: admin.usuario.id } },
  );
  const summary = await request(
    "admin/anti-automation",
    "GET",
    null,
    admin.usuario.id,
  );
  assert.equal(summary.status, 200);
  const review = await request(
    `admin/anti-automation/${personagem.id}/review`,
    "POST",
    { action: "reset", reason: "Teste de revisão auditada" },
    admin.usuario.id,
  );
  assert.equal(review.status, 200);
  assert.equal((await Risk.findByPk(personagem.id)).score, 0);
  const log = await require("../src/models/AdminActionLog").findOne({
    where: { id_admin: admin.usuario.id, acao: "anti_automation.reset" },
  });
  assert.ok(log);
  await Risk.destroy({ where: { id_personagem: personagem.id } });
});

test("HTTP PvE: ten requests for one encounter version resolve one turn; a new encounter identity cannot be replayed",async(t)=>{
  if(!available)return t.skip("requires local PostgreSQL");
  const {usuario,personagem}=await criarPersonagem();
  const Character=require("../src/models/Character");
  const encounterId=require("node:crypto").randomUUID();
  await personagem.update({encontro_pve:{encounterId,combatTurn:0,criadoEm:Date.now(),nome:"Alvo de teste",nivel:1,vida_atual:100000,vida_maxima:100000,forca:1,vitalidade:1,agilidade:0,velocidade:0,defesa:0,dano_base:1}});
  t.mock.method(require("../src/services/gameSettingCache"),"obter",(key,value)=>key==="anti_automation.risk_enabled"?false:value);
  const app=require("express")();app.use(require("express").json());app.use("/api/combat",require("../src/routes/combatRoutes"));
  const server=require("node:http").createServer(app);await new Promise(r=>server.listen(0,"127.0.0.1",r));
  t.after(()=>new Promise(r=>server.close(r)));
  const token=require("jsonwebtoken").sign({id:usuario.id,proposito:"session"},require("../src/config/jwt").JWT_SECRET,{expiresIn:"1m"});
  const request=body=>fetch(`http://127.0.0.1:${server.address().port}/api/combat/action`,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify(body)});
  assert.equal((await request({action:{type:"pass"}})).status,409);
  const results=await Promise.all(Array.from({length:10},()=>request({stateVersion:0,encounterId,action:{type:"pass"}})));
  assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.status===409).length,9);
  const valid=await results.find(r=>r.status===200).json();assert.equal(valid.data.enemy.combatTurn,1);
  assert.equal((await Character.findByPk(personagem.id)).encontro_pve.combatTurn,1);
  assert.equal((await request({stateVersion:1,encounterId:"wrong-encounter",action:{type:"pass"}})).status,409);
  assert.equal((await Character.findByPk(personagem.id)).encontro_pve.combatTurn,1);
  await Character.update({encontro_pve:null},{where:{id:personagem.id}});
});
