// Sistema de Referral — no registro, o jogador pode informar o username
// de quem o indicou (userController.registerUser, campo "indicado_por");
// o painel admin (adminReferralService, permissão "referrals.view")
// mostra quem foi indicado, por quem, e quantas indicações no total
// aquele indicador já tem.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const User = require("../src/models/User");
const AdminRole = require("../src/models/AdminRole");
const userController = require("../src/controllers/userController");
const adminReferralService = require("../src/services/adminReferralService");
const adminRoleService = require("../src/services/adminRoleService");
const requireAdminPermission = require("../src/middlewares/requireAdminPermission");

let temBanco = false;
test.before(async () => {
  temBanco = await bancoDisponivel();
});

function testeComBanco(nome, fn) {
  test(nome, async (t) => {
    if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
    return fn(t);
  });
}

function reqRes(body) {
  let statusCode = null;
  let corpo = null;
  const req = { body };
  const res = {
    status(codigo) {
      statusCode = codigo;
      return this;
    },
    json(payload) {
      corpo = payload;
      return this;
    },
  };
  return { req, res, getStatus: () => statusCode, getBody: () => corpo };
}

async function registrar({ username, email, password = "senha123", indicadoPor }) {
  const { req, res, getStatus, getBody } = reqRes({
    username,
    email,
    password,
    ...(indicadoPor !== undefined ? { indicado_por: indicadoPor } : {}),
  });
  await userController.registerUser(req, res);
  return { statusCode: getStatus(), corpo: getBody() };
}

testeComBanco("registerUser sem indicado_por: conta criada normalmente, id_indicado_por fica null", async () => {
  const chave = sufixo();
  const { statusCode } = await registrar({ username: `sem_ind_${chave}`, email: `sem_ind_${chave}@teste.local` });
  assert.equal(statusCode, 201);

  const usuario = await User.findOne({ where: { username: `sem_ind_${chave}` } });
  assert.ok(usuario);
  assert.equal(usuario.id_indicado_por, null);
});

testeComBanco("registerUser com indicado_por válido (case-insensitive): vincula id_indicado_por certo", async () => {
  const chave = sufixo();
  const indicador = await User.create({
    username: `Indicador_${chave}`,
    email: `indicador_${chave}@teste.local`,
    passwordHash: "hash-de-teste",
  });

  // Digitado em minúsculo, diferente do cadastro (case-insensitive tem que casar mesmo assim).
  const { statusCode } = await registrar({
    username: `indicado_${chave}`,
    email: `indicado_${chave}@teste.local`,
    indicadoPor: `indicador_${chave}`,
  });
  assert.equal(statusCode, 201);

  const indicado = await User.findOne({ where: { username: `indicado_${chave}` } });
  assert.ok(indicado);
  assert.equal(indicado.id_indicado_por, indicador.id);
});

testeComBanco("registerUser com indicado_por que não existe: rejeita com 400 e NÃO cria a conta", async () => {
  const chave = sufixo();
  const { statusCode, corpo } = await registrar({
    username: `orfao_${chave}`,
    email: `orfao_${chave}@teste.local`,
    indicadoPor: `ninguem_com_esse_nome_${chave}`,
  });
  assert.equal(statusCode, 400);
  assert.match(corpo.message, /não encontrado/);

  const usuario = await User.findOne({ where: { username: `orfao_${chave}` } });
  assert.equal(usuario, null, "conta não pode ser criada quando o indicador informado não existe");
});

testeComBanco("registerUser com indicado_por em branco (só espaços): trata como sem indicação, não rejeita", async () => {
  const chave = sufixo();
  const { statusCode } = await registrar({
    username: `espaco_${chave}`,
    email: `espaco_${chave}@teste.local`,
    indicadoPor: "   ",
  });
  assert.equal(statusCode, 201);
  const usuario = await User.findOne({ where: { username: `espaco_${chave}` } });
  assert.equal(usuario.id_indicado_por, null);
});

testeComBanco("adminReferralService.listarIndicados: agrega indicado + indicador + total de indicações do indicador", async () => {
  const chave = sufixo();
  const indicador = await User.create({
    username: `Ranking_${chave}`,
    email: `ranking_${chave}@teste.local`,
    passwordHash: "hash-de-teste",
  });
  const indicado1 = await User.create({
    username: `filho1_${chave}`,
    email: `filho1_${chave}@teste.local`,
    passwordHash: "hash-de-teste",
    id_indicado_por: indicador.id,
  });
  const indicado2 = await User.create({
    username: `filho2_${chave}`,
    email: `filho2_${chave}@teste.local`,
    passwordHash: "hash-de-teste",
    id_indicado_por: indicador.id,
  });
  // Conta sem indicação nenhuma — nunca pode aparecer na listagem.
  await User.create({
    username: `sozinho_${chave}`,
    email: `sozinho_${chave}@teste.local`,
    passwordHash: "hash-de-teste",
  });

  const resultado = await adminReferralService.listarIndicados({ busca: chave });
  const idsRetornados = resultado.indicados.map((i) => i.id).sort();
  assert.deepEqual(idsRetornados, [indicado1.id, indicado2.id].sort());

  for (const linha of resultado.indicados) {
    assert.equal(linha.indicadoPor.id, indicador.id);
    assert.equal(linha.indicadoPor.username, indicador.username);
    assert.equal(linha.indicadoPor.totalIndicacoes, 2, "indicador trouxe 2 pessoas — mesmo número nas duas linhas");
  }
});

testeComBanco("adminReferralService.obterResumo: conta contas indicadas e indicadores distintos", async () => {
  const chave = sufixo();
  const indicadorA = await User.create({ username: `resA_${chave}`, email: `resA_${chave}@teste.local`, passwordHash: "hash-de-teste" });
  const indicadorB = await User.create({ username: `resB_${chave}`, email: `resB_${chave}@teste.local`, passwordHash: "hash-de-teste" });
  await User.create({ username: `resFilhoA1_${chave}`, email: `resFilhoA1_${chave}@teste.local`, passwordHash: "hash-de-teste", id_indicado_por: indicadorA.id });
  await User.create({ username: `resFilhoA2_${chave}`, email: `resFilhoA2_${chave}@teste.local`, passwordHash: "hash-de-teste", id_indicado_por: indicadorA.id });
  await User.create({ username: `resFilhoB1_${chave}`, email: `resFilhoB1_${chave}@teste.local`, passwordHash: "hash-de-teste", id_indicado_por: indicadorB.id });

  const antes = await adminReferralService.obterResumo();
  // Sanidade: os 3 indicados/2 indicadores criados aqui precisam estar
  // refletidos no total (não comparamos igualdade exata porque outros
  // testes deste MESMO arquivo, rodando na mesma suíte, também inserem
  // linhas — total é cumulativo no banco compartilhado de teste).
  assert.ok(antes.totalIndicados >= 3);
  assert.ok(antes.totalIndicadores >= 2);
});

testeComBanco("requireAdminPermission('referrals.view') bloqueia sem a permissão e libera com a role certa", async () => {
  const chave = sufixo();
  const usuarioComum = await User.create({ username: `semperm_${chave}`, email: `semperm_${chave}@teste.local`, passwordHash: "hash-de-teste", isAdmin: true });
  const usuarioComPermissao = await User.create({ username: `comperm_${chave}`, email: `comperm_${chave}@teste.local`, passwordHash: "hash-de-teste", isAdmin: true });

  const roleGameMaster = await AdminRole.findOne({ where: { nome: "GameMaster" } });
  assert.ok(roleGameMaster, "seed de roles precisa ter GameMaster (mesma migration que criou players.view)");
  await adminRoleService.assignRole(usuarioComPermissao.id, roleGameMaster.id, { idAdmin: usuarioComPermissao.id });

  const middleware = requireAdminPermission("referrals.view");

  let bloqueado = false;
  await middleware({ user: { id: usuarioComum.id } }, { status: () => ({ json: () => { bloqueado = true; } }) }, () => {
    bloqueado = false;
  });
  assert.equal(bloqueado, true, "usuário sem nenhuma role/permissão precisa ser bloqueado");

  let liberado = false;
  await middleware({ user: { id: usuarioComPermissao.id } }, { status: () => ({ json: () => {} }) }, () => {
    liberado = true;
  });
  assert.equal(liberado, true, "GameMaster tem referrals.view por padrão (migration 20261216010000)");
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
