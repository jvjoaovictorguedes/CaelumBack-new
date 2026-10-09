const test = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const { sequelize, bancoDisponivel, criarPersonagem } = require("./helpers/db");
const M = require("../src/models/discordNewsModels");
const S = require("../src/services/discordNewsService");
const P = require("../src/discord/presentation");
const { answer } = require("../src/discord/knowledge");
const worker = require("../src/discord/worker");
const { verifySignature } = require("../src/routes/discordInteractionRoutes");
const Power = require("../src/models/Power"),
  Patch = require("../src/models/PatchNote"),
  Wiki = require("../src/models/WikiArticle"),
  Log = require("../src/models/AdminActionLog");
const { registrarAcao } = require("../src/services/adminAuditService");
let ready = false;
test.before(async () => {
  ready = await bancoDisponivel();
});
test.after(() => sequelize.close());
test("public diff strips unapproved fields and Discord mentions", () => {
  assert.deepEqual(
    P.diff("User", { password: "old" }, { password: "new" }),
    [],
  );
  assert.deepEqual(
    P.diff(
      "Power",
      { dano_base: 100, ip: "old" },
      { dano_base: 120, ip: "new" },
    ),
    [{ field: "dano_base", label: "Dano base", before: 100, after: 120 }],
  );
  assert.equal(
    P.patchVisible({ status: "Rascunho", publicado_em: "2000-01-01" }),
    false,
  );
  assert.equal(
    P.patchVisible({ status: "Agendado", publicado_em: "2099-01-01" }),
    false,
  );
  assert.equal(
    P.patchVisible({ status: "Agendado", publicado_em: "2000-01-01" }),
    true,
  );
  assert.equal(P.clean("@everyone <@123>"), "＠everyone ");
  assert.deepEqual(
    P.patchPayload(
      { versao: "v1", titulo: "x", descricao: "@everyone", id: 1 },
      "staging",
    ).allowed_mentions,
    { parse: [] },
  );
});
test("Discord Ed25519 verifies original bytes, tampering and expiry", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const pub = publicKey
    .export({ type: "spki", format: "der" })
    .subarray(-32)
    .toString("hex");
  const timestamp = String(Math.floor(Date.now() / 1000)),
    raw = Buffer.from('{"type":1}');
  const signature = crypto
    .sign(null, Buffer.concat([Buffer.from(timestamp), raw]), privateKey)
    .toString("hex");
  assert.equal(verifySignature(raw, signature, timestamp, pub), true);
  assert.equal(
    verifySignature(Buffer.from('{"type":2}'), signature, timestamp, pub),
    false,
  );
  assert.equal(
    verifySignature(raw, signature, timestamp, pub, Date.now() + 600000),
    false,
  );
  assert.equal(verifySignature(raw, "bad", timestamp, pub), false);
});
test("Discord news transaction, approval, publication, queries and authenticated HTTP", async (t) => {
  if (!ready) return t.skip("PostgreSQL required");
  const beforeEnv = { ...process.env };
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  Object.assign(process.env, {
    CAELUM_RELEASE_ENV: "staging",
    DISCORD_NEWS_ENABLED: "true",
    DISCORD_APPLICATION_ID: "123456789012345678",
    DISCORD_GUILD_ID: "223456789012345678",
    DISCORD_NEWS_CHANNEL_ID: "323456789012345678",
    DISCORD_PUBLIC_KEY: publicKey
      .export({ type: "spki", format: "der" })
      .subarray(-32)
      .toString("hex"),
    DISCORD_BOT_TOKEN: "test-token-never-sent",
  });
  const originalState = (await M.State.findByPk(1)).toJSON();
  await M.State.update(
    { enabled: true, auto_patch_notes: false },
    { where: { id: 1 } },
  );
  const admin = await criarPersonagem({ isAdmin: true }),
    ordinary = await criarPersonagem();
  const actor = { idAdmin: admin.usuario.id };
  const token = Date.now();
  const power = await Power.create({
    nome: `Discord habilidade ${token}`,
    descricao: "Dano oficial",
    tipo_poder: "Ativo",
    escala_atributo: "Forca",
    dano_base: 100,
    custo_mana: 5,
    cooldown: 1,
    valor_escala: 0.5,
  });
  const privatePower = await Power.create({
    nome: `Discord privada ${token}`,
    descricao: "MONSTER_ONLY_SECRET",
    tipo_poder: "Ativo",
    escala_atributo: "Forca",
    usage_scope: "MONSTER",
  });
  const patch = await Patch.create({
    ordem: 99000,
    feature: "Discord test",
    versao: "teste",
    titulo: "Patch público",
    descricao: "Correção oficial",
    status: "Publicado",
    publicado_em: "2000-01-01",
  });
  const draft = await Patch.create({
    ordem: 99001,
    feature: "Discord test",
    versao: "teste",
    titulo: "PATCH_DRAFT_SECRET",
    descricao: "segredo",
    status: "Rascunho",
    publicado_em: "2000-01-01",
  });
  const article = await Wiki.create({
    categoria: "Test",
    slug: `discord-test-${token}`,
    titulo: `Guia Discord ${token}`,
    conteudo: "Regra oficial publicada",
    publicado: true,
  });
  const secretArticle = await Wiki.create({
    categoria: "Test",
    slug: `discord-secret-${token}`,
    titulo: `Guia secreto ${token}`,
    conteudo: "WIKI_DRAFT_SECRET",
    publicado: false,
  });
  let logIds = [],
    deliveryIds = [],
    extraPatchIds = [],
    server;
  t.after(async () => {
    if (server) await new Promise((r) => server.close(r));
    await M.Interaction.destroy({ where: { user_id: "423456789012345678" } });
    await M.Delivery.destroy({ where: { id: deliveryIds } });
    await M.Change.destroy({ where: { audit_id: logIds } });
    await Log.destroy({ where: { id: logIds } });
    await Patch.destroy({
      where: { id: [patch.id, draft.id, ...extraPatchIds] },
    });
    await Wiki.destroy({ where: { id: [article.id, secretArticle.id] } });
    await Power.destroy({ where: { id: [power.id, privatePower.id] } });
    await M.State.update(originalState, { where: { id: 1 } });
    for (const k of Object.keys(process.env))
      if (!Object.hasOwn(beforeEnv, k)) delete process.env[k];
    Object.assign(process.env, beforeEnv);
  });
  await t.test(
    "audited edit stores real before/after in the same transaction; rollback leaves neither",
    async () => {
      const powerService = require("../src/services/adminPowerService");
      await powerService.updateAdminPower(
        power.id,
        { dano_base: 120, valor_escala: 0.6 },
        actor,
      );
      const c = await M.Change.findOne({
        where: { entity: "Power", entity_id: power.id },
      });
      assert.ok(c);
      logIds.push(c.audit_id);
      assert.equal(c.status, "Pending");
      assert.deepEqual(
        c.diff.find((d) => d.field === "dano_base"),
        { field: "dano_base", label: "Dano base", before: 100, after: 120 },
      );
      assert.equal(
        (await answer("caelum-mudancas", { nome: power.nome })).includes(
          "Não há histórico",
        ),
        true,
      );
      await assert.rejects(
        sequelize.transaction(async (transaction) => {
          await registrarAcao({
            idAdmin: admin.usuario.id,
            acao: "editar",
            entidade: "Power",
            idEntidade: power.id,
            dadosAntes: { nome: power.nome, dano_base: 120 },
            dadosDepois: { nome: power.nome, dano_base: 130 },
            transaction,
          });
          throw new Error("rollback");
        }),
      );
      assert.equal(await M.Change.count({ where: { entity_id: power.id } }), 1);
    },
  );
  const change = await M.Change.findOne({ where: { entity_id: power.id } });
  await t.test(
    "approval is explicit, requires a reason, is single-use and queues one public snapshot",
    async () => {
      await assert.rejects(
        S.reviewChange(change.id, { action: "approve", reason: "x" }, actor),
        /motivo/,
      );
      const results = await Promise.allSettled([
        S.reviewChange(
          change.id,
          { action: "approve", reason: "Balanceamento aprovado" },
          actor,
        ),
        S.reviewChange(
          change.id,
          { action: "approve", reason: "Balanceamento aprovado" },
          actor,
        ),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const d = await M.Delivery.findOne({
        where: { source_key: `change:${change.id}` },
      });
      deliveryIds.push(d.id);
      assert.equal(d.status, "Pending");
      assert.match(d.payload.embeds[0].description, /100 → 120/);
      assert.equal(JSON.stringify(d.payload).includes("id_admin"), false);
      const history = await answer("caelum-mudancas", { nome: power.nome });
      assert.match(history, /100 → 120/);
      assert.match(history, /não representa produção/);
    },
  );
  await t.test(
    "patches deduplicate and draft/scheduled future news stay private",
    async () => {
      await assert.rejects(
        S.queuePatch(draft.id, { reason: "Publicar novidades" }, actor),
        /visíveis/,
      );
      const both = await Promise.all([
        S.queuePatch(patch.id, { reason: "Publicar novidades" }, actor),
        S.queuePatch(patch.id, { reason: "Publicar novidades" }, actor),
      ]);
      assert.equal(both[0].id, both[1].id);
      deliveryIds.push(both[0].id);
      const out = await answer("caelum-noticias");
      assert.equal(out.includes("PATCH_DRAFT_SECRET"), false);
    },
  );
  await t.test(
    "queries read current values, distinguish missing history and hide monster powers/wiki drafts",
    async () => {
      const current = await answer("caelum-habilidade", { nome: power.nome });
      assert.match(current, /Dano base: 120/);
      assert.match(current, /Forca × 0.6/);
      assert.match(current, /não o dano final/);
      assert.equal(
        (
          await answer("caelum-habilidade", { nome: privatePower.nome })
        ).includes("MONSTER_ONLY_SECRET"),
        false,
      );
      assert.match(
        await answer("caelum-guia", { assunto: article.titulo }),
        /Regra oficial publicada/,
      );
      assert.equal(
        (
          await answer("caelum-guia", { assunto: secretArticle.titulo })
        ).includes("WIKI_DRAFT_SECRET"),
        false,
      );
      assert.match(
        await answer("caelum-habilidade", { nome: "%" }),
        /Informe um nome/,
      );
    },
  );
  await t.test(
    "only one worker claims a delivery; successful send is not repeated",
    async () => {
      const sent = [];
      const send = async (channel, payload, nonce) => {
        sent.push(nonce);
        return { id: `52345678901234567${sent.length}` };
      };
      await Promise.all([
        worker.tick({ send, checkDestination: async () => true }),
        worker.tick({ send, checkDestination: async () => true }),
      ]);
      assert.equal(sent.length, 2);
      assert.equal(new Set(sent).size, 2);
      await worker.tick({ send, checkDestination: async () => true });
      assert.equal(sent.length, 2);
      await assert.rejects(
        S.retry(deliveryIds[0], { reason: "Repetir notícia" }, actor),
        /falhas confirmadas/,
      );
    },
  );
  await t.test(
    "ambiguous sends require review; rate limits retry safely; wrong destination never sends",
    async () => {
      const d = await M.Delivery.findByPk(deliveryIds[1]);
      await d.update({ status: "Pending", available_at: new Date() });
      let count = 0;
      await worker.tick({
        send: async () => {
          count++;
          throw Object.assign(new Error("timeout"), { ambiguous: true });
        },
        checkDestination: async () => true,
      });
      await d.reload();
      assert.equal(d.status, "Review");
      await worker.tick({
        send: async () => {
          count++;
        },
        checkDestination: async () => true,
      });
      assert.equal(count, 1);
      await assert.rejects(
        S.retry(d.id, { reason: "Tentar novamente" }, actor),
        /conciliação/,
      );
      await S.reconcile(
        d.id,
        { reason: "Conferi o canal, mensagem ausente", action: "absent" },
        actor,
      );
      await S.retry(d.id, { reason: "Ausência confirmada" }, actor);
      await worker.tick({
        send: async () => {
          count++;
          throw Object.assign(new Error("limited"), {
            status: 429,
            retryAfter: 2,
          });
        },
        checkDestination: async () => true,
      });
      await d.reload();
      assert.equal(d.status, "Pending");
      assert.ok(d.available_at > new Date());
      await d.update({ available_at: new Date() });
      await worker.tick({
        send: async () => {
          count++;
        },
        checkDestination: async () => false,
      });
      assert.equal(count, 2);
      await M.State.update({ enabled: false }, { where: { id: 1 } });
      await worker.tick({
        send: async () => {
          count++;
        },
        checkDestination: async () => true,
      });
      assert.equal(count, 2);
      await M.State.update({ enabled: true }, { where: { id: 1 } });
    },
  );
  await t.test(
    "HTTP admin permissions and signed Discord requests enforce server, signature and replay",
    async () => {
      const express = require("express"),
        app = express();
      app.use(
        "/api/discord",
        require("../src/routes/discordInteractionRoutes"),
      );
      app.use(express.json());
      app.use(
        "/api/admin/discord-news",
        require("../src/routes/adminDiscordNewsRoutes"),
      );
      server = app.listen(0);
      const base = `http://127.0.0.1:${server.address().port}`;
      const jwt = require("jsonwebtoken"),
        secret = require("../src/config/jwt").JWT_SECRET;
      const adminRequest = (user) =>
        fetch(`${base}/api/admin/discord-news`, {
          headers: {
            authorization: `Bearer ${jwt.sign({ id: user, proposito: "session" }, secret)}`,
          },
        });
      assert.equal((await adminRequest(ordinary.usuario.id)).status, 403);
      assert.equal((await adminRequest(admin.usuario.id)).status, 403);
      await sequelize.query(
        `INSERT INTO user_admin_roles (id_user,id_role,"createdAt","updatedAt") SELECT :user,id,NOW(),NOW() FROM admin_roles WHERE nome='SuperAdmin' ON CONFLICT DO NOTHING`,
        { replacements: { user: admin.usuario.id } },
      );
      const dashboard = await adminRequest(admin.usuario.id);
      assert.equal(dashboard.status, 200);
      assert.equal(
        (await dashboard.text()).includes("test-token-never-sent"),
        false,
      );
      const post = async (body) => {
        const raw = Buffer.from(JSON.stringify(body)),
          ts = String(Math.floor(Date.now() / 1000));
        const sig = crypto
          .sign(null, Buffer.concat([Buffer.from(ts), raw]), privateKey)
          .toString("hex");
        return fetch(`${base}/api/discord/interactions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-signature-timestamp": ts,
            "x-signature-ed25519": sig,
          },
          body: raw,
        });
      };
      assert.equal(
        (
          await fetch(`${base}/api/discord/interactions`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: '{"type":1}',
          })
        ).status,
        401,
      );
      assert.deepEqual(await (await post({ type: 1 })).json(), { type: 1 });
      const command = {
        id: "623456789012345678",
        type: 2,
        application_id: process.env.DISCORD_APPLICATION_ID,
        guild_id: process.env.DISCORD_GUILD_ID,
        member: { user: { id: "423456789012345678" } },
        data: {
          name: "caelum-habilidade",
          options: [{ name: "nome", value: power.nome }],
        },
      };
      assert.equal((await post({ ...command, guild_id: "wrong" })).status, 403);
      const reply = await (await post(command)).json();
      assert.equal(reply.type, 4);
      assert.equal(reply.data.flags, 64);
      assert.match(reply.data.content, /Dano base: 120/);
      assert.deepEqual(reply.data.allowed_mentions, { parse: [] });
      assert.match(
        (await (await post(command)).json()).data.content,
        /já foi recebido/,
      );
    },
  );
  await t.test(
    "automatic harvest waits for scheduled publication and pages beyond 100 notes",
    async () => {
      await M.State.update({ auto_patch_notes: true }, { where: { id: 1 } });
      const scheduled = await Patch.create({
        ordem: 99002,
        feature: "Discord test",
        versao: "teste",
        titulo: "Programada",
        descricao: "Notícia programada",
        status: "Agendado",
        publicado_em: "2099-01-01",
      });
      extraPatchIds.push(scheduled.id);
      await S.harvestPatchNotes();
      assert.equal(
        await M.Delivery.count({
          where: { source_key: `patch:${scheduled.id}` },
        }),
        0,
      );
      await scheduled.update({ publicado_em: "2000-01-01" });
      const batch = await Patch.bulkCreate(
        Array.from({ length: 101 }, (_, i) => ({
          ordem: 99100 + i,
          feature: "Discord test",
          versao: "teste",
          titulo: `Lote ${i}`,
          descricao: "Notícia oficial",
          status: "Publicado",
          publicado_em: "2000-01-01",
        })),
      );
      extraPatchIds.push(...batch.map((n) => n.id));
      await S.harvestPatchNotes();
      await S.harvestPatchNotes();
      const deliveries = await M.Delivery.findAll({
        where: { kind: "patch", source_id: extraPatchIds },
      });
      deliveryIds.push(...deliveries.map((d) => d.id));
      assert.equal(deliveries.length, 102);
      assert.equal(
        await M.Delivery.count({ where: { source_key: `patch:${draft.id}` } }),
        0,
      );
      await M.State.update({ auto_patch_notes: false }, { where: { id: 1 } });
    },
  );
  await t.test(
    "activation validates the destination before changing settings",
    async () => {
      await M.State.update({ enabled: false }, { where: { id: 1 } });
      await assert.rejects(
        S.updateSettings(
          {
            enabled: true,
            auto_patch_notes: false,
            reason: "Ativar notícias oficiais",
          },
          actor,
          { checkDestination: async () => false },
        ),
        /servidor configurado/,
      );
      assert.equal((await M.State.findByPk(1)).enabled, false);
      await assert.rejects(
        S.updateSettings(
          {
            enabled: true,
            auto_patch_notes: false,
            reason: "Ativar notícias oficiais",
          },
          actor,
          {
            checkDestination: async () => {
              throw new Error("secret Discord error");
            },
          },
        ),
        /Confira o token/,
      );
      await S.updateSettings(
        {
          enabled: true,
          auto_patch_notes: false,
          reason: "Destino validado para teste",
        },
        actor,
        { checkDestination: async () => true },
      );
      assert.equal((await M.State.findByPk(1)).enabled, true);
    },
  );
  // Audit entries generated by management operations are local fixtures as well.
  const managementLogs = await Log.findAll({
    where: { id_admin: admin.usuario.id, entidade: "DiscordNews" },
  });
  logIds.push(...managementLogs.map((l) => l.id));
});
