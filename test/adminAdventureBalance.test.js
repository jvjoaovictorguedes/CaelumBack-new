// Admin Aventura — Editor de Balanceamento de Monstros por Resultado
// (§14.2 "Integração Admin"). Precisa de Postgres migrado
// (TEST_DATABASE_URL/DATABASE_URL) — sem banco, pulado por completo,
// mesmo padrão do resto da suíte.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo } = require("./helpers/db");
require("../src/models/associations");

const User = require("../src/models/User");
const AdminRole = require("../src/models/AdminRole");
const AdminActionLog = require("../src/models/AdminActionLog");
const AdventureMonster = require("../src/models/AdventureMonster");
const AdventureZone = require("../src/models/AdventureZone");
const AdventureZoneMonster = require("../src/models/AdventureZoneMonster");

const adminRoleService = require("../src/services/adminRoleService");
const requireAdminPermission = require("../src/middlewares/requireAdminPermission");
const adminAdventureService = require("../src/services/adminAdventureService");

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

async function criarUsuarioAdmin() {
  const chave = sufixo();
  return User.create({
    username: `admin_balance_${chave}`,
    email: `admin_balance_${chave}@teste.local`,
    passwordHash: "hash-de-teste",
    isAdmin: true,
  });
}

function reqRes({ userId } = {}) {
  const req = { user: userId ? { id: userId } : undefined, body: {}, query: {}, ip: "127.0.0.1", get: () => "teste-agent" };
  let statusCode = null;
  let corpo = null;
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
  return { req, res, resultado: () => ({ statusCode, corpo }) };
}

// "Teste" (com T maiúsculo) é a convenção real do projeto pra fixture
// descartável (ver adventureHunts.test.js/aventuraExpansao.test.js) —
// aventuraExpansao.test.js filtra zonas globais com
// `nome NOT LIKE '%Teste%'` (case-sensitive no Postgres) pra nunca
// contar fixture de outro arquivo de teste; um "teste" minúsculo aqui
// vazaria pra dentro da contagem "exatamente 10 áreas ativas" e quebraria
// aquele teste sem relação nenhuma com este arquivo.
async function criarMonstroDeTeste() {
  return AdventureMonster.create({
    nome: `Monstro Teste ${sufixo()}`,
    descricao: "Descartável de teste.",
    multiplicador_vida: 1,
    multiplicador_dano: 1,
    multiplicador_agilidade: 1,
    multiplicador_velocidade: 1,
    ativo: true,
  });
}

// -------------------------------------------------------------- §14.2.1
testeComBanco('requireAdminPermission("adventure.manage") bloqueia sem a permissão e libera com role Conteudo', async () => {
  const admin = await criarUsuarioAdmin();
  const middleware = requireAdminPermission("adventure.manage");
  const res = { status() { return this; }, json() {} };

  let chamouNext = false;
  await middleware({ user: { id: admin.id } }, res, () => { chamouNext = true; });
  assert.equal(chamouNext, false, "sem role, adventure.manage deve bloquear preview/simulação/update");

  const role = await AdminRole.findOne({ where: { nome: "Conteudo" } });
  await adminRoleService.assignRole(admin.id, role.id, { idAdmin: admin.id });

  chamouNext = false;
  await middleware({ user: { id: admin.id } }, res, () => { chamouNext = true; });
  assert.equal(chamouNext, true, "Conteudo tem adventure.manage — devia liberar");
});

// -------------------------------------------------------------- §14.2.3
testeComBanco("preview não altera o AdventureMonster", async () => {
  const monstro = await criarMonstroDeTeste();
  const antes = monstro.toJSON();

  await adminAdventureService.previewMonsterBalance(monstro.id, {
    referenceLevel: 20,
    mode: "desired",
    desired: { hpMean: 500, damageMean: 60, dodgeVsAveragePct: 15, speedMean: 20 },
  });

  const depois = await AdventureMonster.findByPk(monstro.id);
  assert.deepEqual(depois.toJSON(), antes, "preview nunca pode escrever no AdventureMonster");
});

testeComBanco("preview no Modo Avançado (mode=multipliers) também não altera o AdventureMonster", async () => {
  const monstro = await criarMonstroDeTeste();
  const antes = monstro.toJSON();

  await adminAdventureService.previewMonsterBalance(monstro.id, {
    referenceLevel: 20,
    mode: "multipliers",
    multiplicadores: { vida: 1.5, dano: 1.2, agilidade: 0.9, velocidade: 1.1 },
  });

  const depois = await AdventureMonster.findByPk(monstro.id);
  assert.deepEqual(depois.toJSON(), antes);
});

testeComBanco("preview rejeita id de monstro inexistente", async () => {
  await assert.rejects(() => adminAdventureService.previewMonsterBalance(999999999, { referenceLevel: 20 }));
});

// -------------------------------------------------------------- §14.2.4
testeComBanco("simulação não altera o AdventureMonster nem cria nenhum registro de personagem/economia", async () => {
  const monstro = await criarMonstroDeTeste();
  const antes = monstro.toJSON();

  const simulacao = await adminAdventureService.simulateMonsterBalance(monstro.id, {
    referenceLevel: 20,
    multiplicadores: { vida: 1, dano: 1, agilidade: 1, velocidade: 1 },
    iterations: 50,
  });

  assert.equal(simulacao.totalCombates, 50);
  assert.ok(Number.isFinite(simulacao.taxaVitoriaJogadorPct));

  const depois = await AdventureMonster.findByPk(monstro.id);
  assert.deepEqual(depois.toJSON(), antes, "simulação nunca pode escrever no AdventureMonster");
});

// -------------------------------------------------------------- §14.2.2
testeComBanco("update do monstro registra audit log com before/after (stats fixos V2)", async () => {
  const admin = await criarUsuarioAdmin();
  const monstro = await criarMonstroDeTeste();

  const antesVida = monstro.vida_maxima;

  await adminAdventureService.updateAdminMonster(
    monstro.id,
    { vida_maxima: 175 },
    { idAdmin: admin.id, req: reqRes({ userId: admin.id }).req },
  );

  const log = await AdminActionLog.findOne({
    where: { entidade: "AdventureMonster", id_entidade: monstro.id, id_admin: admin.id },
    order: [["id", "DESC"]],
  });
  assert.ok(log, "devia existir um audit log da alteração");
  assert.equal(log.dados_antes.vida_maxima, antesVida);
  assert.equal(log.dados_depois.vida_maxima, 175);
});

// -------------------------------------------------------------- §5.1
testeComBanco("preview inclui faixaPorNivel quando o monstro está vinculado a uma zona", async () => {
  const monstro = await criarMonstroDeTeste();
  const zona = await AdventureZone.create({
    nome: `Zona Teste ${sufixo()}`,
    nivel_monstro_min: 18,
    nivel_monstro_max: 22,
    ordem: 999,
    ativa: true,
  });
  await AdventureZoneMonster.create({
    id_area: zona.id,
    id_monstro: monstro.id,
    peso_aparicao: 100,
    tipo_aparicao: "Comum",
    ativo: true,
  });

  const preview = await adminAdventureService.previewMonsterBalance(monstro.id, {
    referenceLevel: 20,
    mode: "multipliers",
    multiplicadores: { vida: 1, dano: 1, agilidade: 1, velocidade: 1 },
  });

  assert.ok(preview.faixaPorNivel, "devia ter calculado a faixa por nível");
  const niveis = preview.faixaPorNivel.map((l) => l.nivel);
  assert.ok(niveis.includes(18) && niveis.includes(20) && niveis.includes(22), `níveis retornados: ${niveis}`);
});

testeComBanco("preview sem nenhuma aparição vinculada devolve faixaPorNivel nula, sem quebrar", async () => {
  const monstro = await criarMonstroDeTeste();
  const preview = await adminAdventureService.previewMonsterBalance(monstro.id, {
    referenceLevel: 20,
    mode: "multipliers",
    multiplicadores: { vida: 1, dano: 1, agilidade: 1, velocidade: 1 },
  });
  assert.equal(preview.faixaPorNivel, null);
});

test.after(async () => {
  if (temBanco) {
    const { sequelize } = require("../src/config/database");
    await sequelize.close();
  }
});
