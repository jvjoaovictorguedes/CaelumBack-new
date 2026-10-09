const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../src/config/jwt");
const { sequelize, criarPersonagem } = require("./helpers/db");
const Estado = require("../src/models/CharacterWorldState");
const Maritimo = require("../src/models/CharacterNavigationState");
const { ESCALA_MUNDO, percentualParaTile, tileParaPercentual, tileParaPixel, chunkDaPosicao, chunksVisiveis } = require("@caelum/world-contracts");

test("Escala única respeita pontos conhecidos, bordas, decimais e ida/volta", () => {
  assert.deepEqual(percentualParaTile(50, 50), { x: 200, y: 90 });
  assert.deepEqual(percentualParaTile(10, 15), { x: 40, y: 27 });
  assert.deepEqual(tileParaPixel(200, 90), { x: 6400, y: 2880 });
  assert.deepEqual(percentualParaTile(100, 100), { x: 400, y: 180 });
  for (const [x, y] of [[0, 0], [23.75, 36.5], [100, 100]]) assert.deepEqual(tileParaPercentual(...Object.values(percentualParaTile(x, y))), { x, y });
  for (const v of [NaN, Infinity, -1, 101, "50", null]) assert.throws(() => percentualParaTile(v, 50));
  assert.throws(() => chunkDaPosicao(400, 180));
  assert.equal(ESCALA_MUNDO.tile_px, 32);
});
test("Interesse por chunks limita viewport e não extravasa o mundo", () => {
  assert.deepEqual(chunkDaPosicao(200, 90), { x: 6, y: 2 });
  const chunks = chunksVisiveis({ x: 12600, y: 5600, largura: 800, altura: 600 });
  assert.ok(chunks.length > 0 && chunks.length < 78);
  assert.ok(chunks.every(p => p.x >= 0 && p.x <= 12 && p.y >= 0 && p.y <= 5));
  assert.deepEqual(chunksVisiveis({ x: -2000, y: 0, largura: 500, altura: 500 }), []);
  assert.throws(() => chunksVisiveis({ x: 0, y: 0, largura: -1, altura: 100 }));
});
test("API autenticada, rollout individual auditado e posição isolada do legado", async t => {
  const app = express(); app.use(express.json());
  app.use("/world", require("../src/world/routes"));
  app.use("/admin/world", require("../src/world/adminRoutes"));
  app.use((erro, _req, res, _next) => res.status(500).json({ message: erro.message }));
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await sequelize.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const pessoa = await criarPersonagem();
  const outra = await criarPersonagem();
  const admin = await criarPersonagem({ isAdmin: true });
  const token = usuario => jwt.sign({ id: usuario.id, proposito: "session" }, JWT_SECRET, { expiresIn: "1h" });
  const request = (path, usuario, options = {}) => fetch(`${base}${path.startsWith("/admin/") ? path : `/world${path}`}`, { ...options, headers: { "Content-Type": "application/json", ...(usuario ? { Authorization: `Bearer ${token(usuario)}` } : {}) } });
  await Maritimo.create({ id_personagem: pessoa.personagem.id, id_port_atual: null, id_zone_atual: null });
  const marAntes = (await Maritimo.findByPk(pessoa.personagem.id)).toJSON();
  const charAntes = pessoa.personagem.toJSON();
  await t.test("sem sessão recebe 401; sem flag recebe 403", async () => {
    assert.equal((await request("/manifesto")).status, 401);
    assert.equal((await request("/manifesto", pessoa.usuario)).status, 403);
    const acesso = await request("/acesso", pessoa.usuario); assert.equal((await acesso.json()).data.habilitado, false);
  });
  await t.test("admin sem permissão e jogador comum não habilitam o mundo", async () => {
    const path = `/admin/world/${pessoa.personagem.id}/acesso`;
    assert.equal((await request(path, pessoa.usuario, { method: "PATCH", body: JSON.stringify({ habilitado: true }) })).status, 403);
    assert.equal((await request(path, admin.usuario, { method: "PATCH", body: JSON.stringify({ habilitado: true }) })).status, 403);
    await sequelize.query(`INSERT INTO user_admin_roles (id_user,id_role,"createdAt","updatedAt") SELECT :id,r.id,NOW(),NOW() FROM admin_roles r WHERE r.nome='SuperAdmin'`, { replacements: { id: admin.usuario.id } });
    assert.equal((await request(path, admin.usuario, { method: "PATCH", body: JSON.stringify({ habilitado: "true" }) })).status, 400);
    assert.equal((await request(path, admin.usuario, { method: "PATCH", body: JSON.stringify({ habilitado: true }) })).status, 200);
    const [auditoria] = await sequelize.query(`SELECT id FROM admin_action_logs WHERE acao='UPDATE_WORLD_ACCESS' AND id_entidade=:id`, { replacements: { id: pessoa.personagem.id } });
    assert.equal(auditoria.length, 1);
  });
  await t.test("manifesto usa identidade do JWT, escala e dados do mapa", async () => {
    assert.equal((await request(`/manifesto?id_personagem=${pessoa.personagem.id}`, outra.usuario)).status, 403);
    const response = await request("/manifesto", pessoa.usuario);
    assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /no-store/);
    const { data } = await response.json();
    assert.equal(data.fase, 0); assert.equal(data.mapas.length, 5); assert.deepEqual(data.operacoes_disponiveis, []);
    assert.deepEqual(data.posicao.tile, { x: 200, y: 90 });
    assert.equal(data.geografia_validada, false);
    assert.ok(data.pontos.some(p => p.nome === "Capital de Caelum" && p.tile.x === 200 && p.tile.y === 90));
  });
  await t.test("cliente não consegue mover, conjurar nem escolher a própria posição na Fase 0", async () => {
    const antes = (await Estado.findByPk(pessoa.personagem.id)).toJSON();
    for (const rota of ["move", "cast", "position"]) assert.equal((await request(`/${rota}`, pessoa.usuario, { method: "POST", body: JSON.stringify({ tile_x: 9999, velocidade: 9999, dano: 9999 }) })).status, 404);
    const depois = (await Estado.findByPk(pessoa.personagem.id)).toJSON(); assert.deepEqual(depois, antes);
    const nav = (await Maritimo.findByPk(pessoa.personagem.id)).toJSON(); assert.deepEqual(nav, marAntes);
    await pessoa.personagem.reload(); assert.deepEqual(pessoa.personagem.toJSON(), charAntes);
    await assert.rejects(Estado.update({ tile_x: 500 }, { where: { id_personagem: pessoa.personagem.id } }));
  });
  await t.test("revogação bloqueia imediatamente uma nova leitura", async () => {
    const response = await request(`/admin/world/${pessoa.personagem.id}/acesso`, admin.usuario, { method: "PATCH", body: JSON.stringify({ habilitado: false }) });
    assert.equal(response.status, 200); assert.equal((await request("/manifesto", pessoa.usuario)).status, 403);
  });
});
