// Painel Administrativo de Expedição (Balanceamento) — cobre os 6
// grupos que a tela junta numa aba só (Expedição: cooldown/progressão/
// drops/emboscada, Aventura: perigo, Aventura em Grupo: escala) contra
// o banco real, provando que updateBalanceamento valida direito E que
// o override realmente pega AO VIVO no config sem reiniciar o processo
// (mesmo padrão de teste já usado em adminForge.test.js).
const test = require("node:test");
const assert = require("node:assert/strict");

const { sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const User = require("../src/models/User");
const GameSetting = require("../src/models/GameSetting");
const AdminActionLog = require("../src/models/AdminActionLog");

const expeditionSettingsService = require("../src/services/expeditionSettingsService");
const expeditionConfig = require("../src/config/expeditionConfig");
const adventureConfig = require("../src/config/adventureConfig");
const partyBattleConfig = require("../src/config/partyBattleConfig");

let temBanco = false;
test.before(async () => {
  try {
    await sequelize.authenticate();
    temBanco = true;
  } catch {
    temBanco = false;
  }
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
    username: `admin_expedicao_${chave}`,
    email: `admin_expedicao_${chave}@teste.local`,
    passwordHash: "hash-de-teste",
    isAdmin: true,
  });
}

async function limparGrupo(grupo) {
  await GameSetting.destroy({ where: { chave: grupo } });
}

testeComBanco("getBalanceamentoCompleto: devolve os 6 grupos com atual+padrao", async () => {
  const tudo = await expeditionSettingsService.getBalanceamentoCompleto();
  for (const grupo of expeditionSettingsService.GRUPOS) {
    assert.ok(tudo[grupo], `grupo ${grupo} ausente`);
    assert.ok(tudo[grupo].atual);
    assert.ok(tudo[grupo].padrao);
  }
});

testeComBanco("expedition.cooldown: rejeita TEMPO_COLETA_MS não-positivo, aceita e aplica ao vivo", async () => {
  const admin = await criarUsuarioAdmin();
  const original = expeditionConfig.TEMPO_COLETA_MS;
  try {
    await assert.rejects(
      () => expeditionSettingsService.updateBalanceamento("expedition.cooldown", { TEMPO_COLETA_MS: 0 }, { idAdmin: admin.id }),
      /inteiro positivo/,
    );

    const resultado = await expeditionSettingsService.updateBalanceamento(
      "expedition.cooldown",
      { TEMPO_COLETA_MS: 5000 },
      { idAdmin: admin.id },
    );
    assert.equal(resultado.atual.TEMPO_COLETA_MS, 5000);
    assert.equal(expeditionConfig.TEMPO_COLETA_MS, 5000, "override precisa valer AO VIVO no config, sem reiniciar");

    const log = await AdminActionLog.findOne({
      where: { entidade: "GameSetting", acao: "UPDATE_EXPEDITION_BALANCE" },
      order: [["id", "DESC"]],
    });
    assert.ok(log);
  } finally {
    expeditionConfig.aplicarOverridesBalanceamento("expedition.cooldown", { TEMPO_COLETA_MS: original });
    await limparGrupo("expedition.cooldown");
  }
});

testeComBanco("expedition.drops: rejeita soma de PPM acima de 1.000.000 no mesmo nível", async () => {
  const admin = await criarUsuarioAdmin();
  await assert.rejects(
    () =>
      expeditionSettingsService.updateBalanceamento(
        "expedition.drops",
        { CHANCE_POR_NIVEL_PPM: { 1: { Comum: 900_000, Incomum: 200_000, Raro: 0, Epico: 0, Lendario: 0, Mitico: 0 } } },
        { idAdmin: admin.id },
      ),
    /não pode passar de 1\.000\.000/,
  );
});

testeComBanco("expedition.drops: aceita e aplica CHANCE_POR_NIVEL_PPM e QUANTIDADE_POR_NIVEL ao vivo", async () => {
  const admin = await criarUsuarioAdmin();
  const original = { ...expeditionConfig.CHANCE_POR_NIVEL_PPM[1] };
  const originalQtd = [...expeditionConfig.QUANTIDADE_POR_NIVEL[1]];
  try {
    const resultado = await expeditionSettingsService.updateBalanceamento(
      "expedition.drops",
      {
        CHANCE_POR_NIVEL_PPM: { 1: { Comum: 500_000, Incomum: 60_000, Raro: 0, Epico: 0, Lendario: 0, Mitico: 0 } },
        QUANTIDADE_POR_NIVEL: { 1: [2, 3] },
      },
      { idAdmin: admin.id },
    );
    assert.equal(resultado.atual.CHANCE_POR_NIVEL_PPM[1].Comum, 500_000);
    assert.equal(expeditionConfig.CHANCE_POR_NIVEL_PPM[1].Comum, 500_000, "precisa valer ao vivo no expeditionRollService");
    assert.deepEqual(expeditionConfig.QUANTIDADE_POR_NIVEL[1], [2, 3]);
  } finally {
    expeditionConfig.aplicarOverridesBalanceamento("expedition.drops", {
      CHANCE_POR_NIVEL_PPM: { 1: original },
      QUANTIDADE_POR_NIVEL: { 1: originalQtd },
    });
    await limparGrupo("expedition.drops");
  }
});

testeComBanco("expedition.ambush: CHANCE_MONSTRO_PPM fora de 0..1.000.000 é rejeitado", async () => {
  const admin = await criarUsuarioAdmin();
  await assert.rejects(
    () => expeditionSettingsService.updateBalanceamento("expedition.ambush", { CHANCE_MONSTRO_PPM: 2_000_000 }, { idAdmin: admin.id }),
    /entre 0 e 1\.000\.000/,
  );
});

testeComBanco("adventure.danger: ALTO precisa ser maior que MEDIO", async () => {
  const admin = await criarUsuarioAdmin();
  await assert.rejects(
    () => expeditionSettingsService.updateBalanceamento("adventure.danger", { MEDIO: 5, ALTO: 3 }, { idAdmin: admin.id }),
    /ALTO precisa ser maior que MEDIO/,
  );
});

testeComBanco("adventure.danger: salva e aplica ao vivo em adventureConfig.LIMIAR_PERIGO", async () => {
  const admin = await criarUsuarioAdmin();
  const original = { ...adventureConfig.LIMIAR_PERIGO };
  try {
    const resultado = await expeditionSettingsService.updateBalanceamento("adventure.danger", { MEDIO: 2, ALTO: 6 }, { idAdmin: admin.id });
    assert.equal(resultado.atual.MEDIO, 2);
    assert.equal(adventureConfig.LIMIAR_PERIGO.MEDIO, 2);
    assert.equal(adventureConfig.LIMIAR_PERIGO.ALTO, 6);
    assert.equal(adventureConfig.calcularPerigo(8, 10, 20), "MEDIO", "calcularPerigo precisa refletir o novo limiar imediatamente");
  } finally {
    adventureConfig.aplicarOverridesBalanceamento("adventure.danger", original);
    await limparGrupo("adventure.danger");
  }
});

testeComBanco("party.balance: TAMANHO_MINIMO_GRUPO menor que 2 é rejeitado", async () => {
  const admin = await criarUsuarioAdmin();
  await assert.rejects(
    () => expeditionSettingsService.updateBalanceamento("party.balance", { TAMANHO_MINIMO_GRUPO: 1 }, { idAdmin: admin.id }),
    />= 2/,
  );
});

testeComBanco("party.balance: TAMANHO_MAXIMO_GRUPO menor que TAMANHO_MINIMO_GRUPO é rejeitado", async () => {
  const admin = await criarUsuarioAdmin();
  await assert.rejects(
    () =>
      expeditionSettingsService.updateBalanceamento(
        "party.balance",
        { TAMANHO_MINIMO_GRUPO: 3, TAMANHO_MAXIMO_GRUPO: 2 },
        { idAdmin: admin.id },
      ),
    />= TAMANHO_MINIMO_GRUPO/,
  );
});

testeComBanco("party.balance: salva e aplica os fatores de dificuldade ao vivo em partyBattleConfig", async () => {
  const admin = await criarUsuarioAdmin();
  const original = {
    TAMANHO_MAXIMO_GRUPO: partyBattleConfig.TAMANHO_MAXIMO_GRUPO,
    TAMANHO_MINIMO_GRUPO: partyBattleConfig.TAMANHO_MINIMO_GRUPO,
    FATOR_DIFICULDADE_VIDA_POR_EXTRA: partyBattleConfig.FATOR_DIFICULDADE_VIDA_POR_EXTRA,
    FATOR_DIFICULDADE_DANO_POR_EXTRA: partyBattleConfig.FATOR_DIFICULDADE_DANO_POR_EXTRA,
  };
  try {
    const resultado = await expeditionSettingsService.updateBalanceamento(
      "party.balance",
      { TAMANHO_MAXIMO_GRUPO: 6, FATOR_DIFICULDADE_VIDA_POR_EXTRA: 0.2, FATOR_DIFICULDADE_DANO_POR_EXTRA: 0.15 },
      { idAdmin: admin.id },
    );
    assert.equal(resultado.atual.TAMANHO_MAXIMO_GRUPO, 6);
    assert.equal(partyBattleConfig.TAMANHO_MAXIMO_GRUPO, 6, "precisa valer ao vivo (partySocket.js lê por propriedade)");
    assert.equal(partyBattleConfig.FATOR_DIFICULDADE_VIDA_POR_EXTRA, 0.2);
    assert.equal(partyBattleConfig.FATOR_DIFICULDADE_DANO_POR_EXTRA, 0.15);
  } finally {
    partyBattleConfig.aplicarOverridesBalanceamento("party.balance", original);
    await limparGrupo("party.balance");
  }
});

testeComBanco("aplicarPersistidosNoBoot: recarrega overrides salvos e reaplica nos configs", async () => {
  const admin = await criarUsuarioAdmin();
  const original = expeditionConfig.CHANCE_MONSTRO_PPM;
  try {
    await expeditionSettingsService.updateBalanceamento("expedition.ambush", { CHANCE_MONSTRO_PPM: 12345 }, { idAdmin: admin.id });
    // Simula o "restart" resetando o valor em memória e recarregando do banco.
    expeditionConfig.aplicarOverridesBalanceamento("expedition.ambush", { CHANCE_MONSTRO_PPM: original });
    assert.equal(expeditionConfig.CHANCE_MONSTRO_PPM, original);

    await expeditionSettingsService.aplicarPersistidosNoBoot();
    assert.equal(expeditionConfig.CHANCE_MONSTRO_PPM, 12345, "boot precisa reaplicar o override persistido");
  } finally {
    expeditionConfig.aplicarOverridesBalanceamento("expedition.ambush", { CHANCE_MONSTRO_PPM: original });
    await limparGrupo("expedition.ambush");
  }
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
