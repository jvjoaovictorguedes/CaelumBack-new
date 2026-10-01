// Painel Administrativo de Pesca — Balanceamento (pedido do jogador:
// editar o XP necessário por nível de Pesca e o buff de Proficiência por
// nível). Mesmo padrão de test/adminForge.test.js (seção Balanceamento).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const User = require("../src/models/User");
const GameSetting = require("../src/models/GameSetting");
const AdminActionLog = require("../src/models/AdminActionLog");
const fishingConfig = require("../src/config/fishingConfig");
const fishingSettingsService = require("../src/services/fishingSettingsService");

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
    username: `admin_pesca_${chave}`,
    email: `admin_pesca_${chave}@teste.local`,
    passwordHash: "hash-de-teste",
    isAdmin: true,
  });
}

test.after(async () => {
  if (temBanco) await sequelize.close();
});

testeComBanco("getBalanceamentoCompleto: expõe os dois grupos de Pesca com atual e padrão", async () => {
  const resultado = await fishingSettingsService.getBalanceamentoCompleto();
  assert.ok(resultado["fishing.progression"]);
  assert.ok(resultado["fishing.proficiency"]);
  assert.equal(resultado["fishing.progression"].atual.NIVEL_MAXIMO_PESCA, 25);
  assert.ok(resultado["fishing.proficiency"].atual.PROFICIENCIA_PCT_POR_NIVEL.controle);
});

testeComBanco("updateBalanceamento(fishing.progression) exige confirmado:true", async () => {
  const admin = await criarUsuarioAdmin();
  await assert.rejects(
    () => fishingSettingsService.updateBalanceamento("fishing.progression", { XP_NECESSARIO_POR_ETAPA_PESCA: { 1: 999 } }, { idAdmin: admin.id }),
    /confirmação explícita/,
  );
});

testeComBanco("updateBalanceamento(fishing.progression) rejeita etapa fora de 1..24 ou XP não positivo", async () => {
  const admin = await criarUsuarioAdmin();
  await assert.rejects(
    () => fishingSettingsService.updateBalanceamento("fishing.progression", { confirmado: true, XP_NECESSARIO_POR_ETAPA_PESCA: { 25: 100 } }, { idAdmin: admin.id }),
    /entre 1 e 24/,
  );
  await assert.rejects(
    () => fishingSettingsService.updateBalanceamento("fishing.progression", { confirmado: true, XP_NECESSARIO_POR_ETAPA_PESCA: { 1: 0 } }, { idAdmin: admin.id }),
    /inteiro positivo/,
  );
});

testeComBanco("updateBalanceamento(fishing.progression) salva, recalcula XP_TOTAL_PARA_NIVEL_PESCA e aplica ao vivo", async () => {
  const admin = await criarUsuarioAdmin();
  const etapa1Original = fishingConfig.XP_NECESSARIO_POR_ETAPA_PESCA[1];
  try {
    const resultado = await fishingSettingsService.updateBalanceamento(
      "fishing.progression",
      { confirmado: true, XP_NECESSARIO_POR_ETAPA_PESCA: { 1: 500 } },
      { idAdmin: admin.id },
    );
    assert.equal(resultado.atual.XP_NECESSARIO_POR_ETAPA_PESCA[1], 500);
    assert.equal(resultado.atual.XP_TOTAL_PARA_NIVEL_PESCA[2], 500, "XP total pro nível 2 precisa refletir a etapa 1 nova");
    assert.equal(fishingConfig.XP_NECESSARIO_POR_ETAPA_PESCA[1], 500, "override precisa valer AO VIVO sem reiniciar o processo");
    assert.equal(fishingConfig.XP_TOTAL_PARA_NIVEL_PESCA[2], 500);

    const log = await AdminActionLog.findOne({ where: { entidade: "GameSetting", acao: "UPDATE_FISHING_BALANCE" }, order: [["id", "DESC"]] });
    assert.ok(log, "precisa auditar a mudança de balanceamento");
  } finally {
    await fishingSettingsService.updateBalanceamento(
      "fishing.progression",
      { confirmado: true, XP_NECESSARIO_POR_ETAPA_PESCA: { 1: etapa1Original } },
      { idAdmin: admin.id },
    );
    await GameSetting.destroy({ where: { chave: "fishing.progression" } });
  }
});

testeComBanco("updateBalanceamento(fishing.proficiency) rejeita campo desconhecido e fora de 0..0.1", async () => {
  const admin = await criarUsuarioAdmin();
  await assert.rejects(
    () => fishingSettingsService.updateBalanceamento("fishing.proficiency", { PROFICIENCIA_PCT_POR_NIVEL: { campo_inexistente: 0.01 } }, { idAdmin: admin.id }),
    /não tem o campo/,
  );
  await assert.rejects(
    () => fishingSettingsService.updateBalanceamento("fishing.proficiency", { PROFICIENCIA_PCT_POR_NIVEL: { controle: 0.5 } }, { idAdmin: admin.id }),
    /entre 0 e 0\.1/,
  );
});

testeComBanco("updateBalanceamento(fishing.proficiency) salva e aplica ao vivo na fórmula de proficiência", async () => {
  const admin = await criarUsuarioAdmin();
  const controleOriginal = fishingConfig.PROFICIENCIA_PCT_POR_NIVEL.controle;
  try {
    await fishingSettingsService.updateBalanceamento(
      "fishing.proficiency",
      { PROFICIENCIA_PCT_POR_NIVEL: { controle: 0.02 } },
      { idAdmin: admin.id },
    );
    assert.equal(fishingConfig.PROFICIENCIA_PCT_POR_NIVEL.controle, 0.02);

    // nível 11 = 10 níveis acima de 1 -> controle sobe 10*2% = +20%
    const efetivo = fishingConfig.aplicarProficienciaPesca({ controle: 100 }, 11);
    assert.equal(efetivo.controle, 120);
  } finally {
    await fishingSettingsService.updateBalanceamento(
      "fishing.proficiency",
      { PROFICIENCIA_PCT_POR_NIVEL: { controle: controleOriginal } },
      { idAdmin: admin.id },
    );
    await GameSetting.destroy({ where: { chave: "fishing.proficiency" } });
  }
});

testeComBanco("aplicarPersistidosNoBoot: relê o override salvo no GameSetting e reaplica no fishingConfig", async () => {
  const admin = await criarUsuarioAdmin();
  const etapa1Original = fishingConfig.XP_NECESSARIO_POR_ETAPA_PESCA[1];
  try {
    await fishingSettingsService.updateBalanceamento(
      "fishing.progression",
      { confirmado: true, XP_NECESSARIO_POR_ETAPA_PESCA: { 1: 777 } },
      { idAdmin: admin.id },
    );
    // simula um restart do processo: volta o valor em memória pro default...
    fishingConfig.XP_NECESSARIO_POR_ETAPA_PESCA[1] = etapa1Original;
    assert.equal(fishingConfig.XP_NECESSARIO_POR_ETAPA_PESCA[1], etapa1Original);
    // ...e confirma que reler do banco restaura o override persistido.
    await fishingSettingsService.aplicarPersistidosNoBoot();
    assert.equal(fishingConfig.XP_NECESSARIO_POR_ETAPA_PESCA[1], 777);
  } finally {
    await fishingSettingsService.updateBalanceamento(
      "fishing.progression",
      { confirmado: true, XP_NECESSARIO_POR_ETAPA_PESCA: { 1: etapa1Original } },
      { idAdmin: admin.id },
    );
    await GameSetting.destroy({ where: { chave: "fishing.progression" } });
  }
});
