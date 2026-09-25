// Sistema de Proezas Únicas §11 — enforcement de contexto competitivo
// (precisa de Postgres migrado em TEST_DATABASE_URL/DATABASE_URL). Sem
// banco, o arquivo inteiro é pulado (mesmo padrão dos demais testes de
// integração desta suíte).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo } = require("./helpers/db");
require("../src/models/associations");

const registry = require("../src/services/uniquePowerEffectRegistry");
const Power = require("../src/models/Power");
const UniquePowerEffect = require("../src/models/UniquePowerEffect");

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

async function criarPowerNormal() {
  return Power.create({
    nome: `Poder normal ${sufixo()}`,
    descricao: "Poder comum de teste.",
    tipo_poder: "Ativo",
    custo_mana: 5,
    escala_atributo: "Forca",
    valor_escala: 1,
  });
}

async function criarPowerUnicoComEfeito(overridesEfeito = {}) {
  const power = await Power.create({
    nome: `Legado de teste ${sufixo()}`,
    descricao: "Power de teste pra Proeza Única.",
    tipo_poder: "Ativo",
    custo_mana: 10,
    escala_atributo: "Forca",
    valor_escala: 1,
    acquisition_scope: "UNIQUE_FEAT",
  });
  const efeito = await UniquePowerEffect.create({
    id_power: power.id,
    effect_key: "TESTE_QUALQUER",
    config: {},
    ...overridesEfeito,
  });
  return { power, efeito };
}

test("registrarEfeito/efeitoConhecido/validarConfig: whitelist básica", () => {
  const chave = `TESTE_${sufixo()}`;
  assert.equal(registry.efeitoConhecido(chave), false);
  assert.throws(() => registry.validarConfig(chave, {}));

  registry.registrarEfeito(chave, {
    validarConfig(config) {
      if (typeof config.valor !== "number") throw new Error("valor obrigatório");
    },
  });
  assert.equal(registry.efeitoConhecido(chave), true);
  assert.throws(() => registry.validarConfig(chave, {}));
  assert.doesNotThrow(() => registry.validarConfig(chave, { valor: 1 }));
});

testeComBanco("Power NORMAL nunca é filtrado em nenhum contexto (nem consulta o banco)", async () => {
  const normal = await criarPowerNormal();
  const desautorizados = await registry.idsDesautorizadosNoContexto([normal.get({ plain: true })], "RANKED");
  assert.deepEqual(desautorizados, []);
});

testeComBanco("Power UNIQUE_FEAT sem UniquePowerEffect configurado é bloqueado em QUALQUER contexto (falha fechado)", async () => {
  const power = await Power.create({
    nome: `Legado sem efeito ${sufixo()}`,
    descricao: "Power UNIQUE_FEAT sem UniquePowerEffect — não devia acontecer, mas defensivo.",
    tipo_poder: "Ativo",
    custo_mana: 10,
    escala_atributo: "Forca",
    valor_escala: 1,
    acquisition_scope: "UNIQUE_FEAT",
  });
  const desautorizados = await registry.idsDesautorizadosNoContexto([power.get({ plain: true })], "PVE");
  assert.deepEqual(desautorizados, [power.id]);
});

testeComBanco("Power UNIQUE_FEAT respeita allow_ranked=false (default) e allow_pve=true (default)", async () => {
  const { power } = await criarPowerUnicoComEfeito();
  const plano = power.get({ plain: true });

  const bloqueadoRanked = await registry.idsDesautorizadosNoContexto([plano], "RANKED");
  assert.deepEqual(bloqueadoRanked, [power.id], "Ranked bloqueia Legado por padrão (§11)");

  const bloqueadoTorneio = await registry.idsDesautorizadosNoContexto([plano], "TOURNAMENT");
  assert.deepEqual(bloqueadoTorneio, [power.id], "Torneio bloqueia Legado por padrão (§11)");

  const bloqueadoPvpCasual = await registry.idsDesautorizadosNoContexto([plano], "PVP_CASUAL");
  assert.deepEqual(bloqueadoPvpCasual, [power.id], "PvP Casual bloqueia Legado por padrão (§11)");

  const permitidoPve = await registry.idsDesautorizadosNoContexto([plano], "PVE");
  assert.deepEqual(permitidoPve, [], "PvE permite Legado por padrão (§11)");

  const permitidoParty = await registry.idsDesautorizadosNoContexto([plano], "PARTY");
  assert.deepEqual(permitidoParty, [], "Party permite Legado por padrão (§11)");
});

testeComBanco("UniquePowerEffect desativado (ativo=false) bloqueia em TODO contexto, mesmo os liberados", async () => {
  const { power } = await criarPowerUnicoComEfeito({ ativo: false });
  const plano = power.get({ plain: true });

  const bloqueadoPve = await registry.idsDesautorizadosNoContexto([plano], "PVE");
  assert.deepEqual(bloqueadoPve, [power.id]);
});

testeComBanco("UniquePowerEffect com allow_ranked=true libera explicitamente em Ranked", async () => {
  const { power } = await criarPowerUnicoComEfeito({ allow_ranked: true });
  const plano = power.get({ plain: true });

  const desautorizados = await registry.idsDesautorizadosNoContexto([plano], "RANKED");
  assert.deepEqual(desautorizados, [], "flag futura explícita por Legado (§11) libera Ranked");
});
