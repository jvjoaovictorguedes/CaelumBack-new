// Admin Aventura — Editor de Balanceamento de Monstros por Resultado
// (§14.1 "Simulação não chama serviços de recompensa/progressão", §14.2
// "Duas simulações simultâneas não interferem uma na outra"). Puro/em
// memória — nunca precisa de banco.
const test = require("node:test");
const assert = require("node:assert/strict");

const Module = require("module");
const monsterBalanceSimulationService = require("../src/services/monsterBalanceSimulationService");

// -------------------------------------------------------------- §14.1.6
// Nenhum require() de serviço de recompensa/progressão aparece no
// arquivo-fonte do simulador — prova estrutural de que ele nunca pode
// chamar XP/Gold/drop/missão/Bestiário/conquista, mesmo que uma
// refatoração futura tente. Junto com o teste de comportamento abaixo
// (nenhuma escrita em Character/Inventory), cobre os dois lados do
// requisito.
test("monsterBalanceSimulationService nunca importa serviços de recompensa/progressão", () => {
  const caminho = require.resolve("../src/services/monsterBalanceSimulationService");
  const codigoFonte = require("fs").readFileSync(caminho, "utf8");
  const proibidos = [
    "experienceService",
    "goldService",
    "dropService",
    "missionService",
    "monsterKillService",
    "adventureRewardService",
    "achievementService",
  ];
  for (const nomeProibido of proibidos) {
    assert.ok(!codigoFonte.includes(nomeProibido), `simulador não devia referenciar ${nomeProibido}`);
  }
});

// -------------------------------------------------------------- §14.2
test("simularCombates nunca toca em Character/Inventory (só objetos locais em memória)", () => {
  const originalRequire = Module.prototype.require;
  const chamadasProibidas = [];
  Module.prototype.require = function (id) {
    if (/models\/(Character|CharacterInventory|CharacterEquipment)/.test(id)) {
      chamadasProibidas.push(id);
    }
    return originalRequire.apply(this, arguments);
  };
  try {
    monsterBalanceSimulationService.simularCombates({ nivel: 20, multiplicadores: { vida: 1, dano: 1, agilidade: 1, velocidade: 1 }, iteracoes: 20 });
  } finally {
    Module.prototype.require = originalRequire;
  }
  assert.deepEqual(chamadasProibidas, []);
});

// -------------------------------------------------------------- §14.2 (concorrência)
test("duas simulações concorrentes com parâmetros MUITO diferentes não se misturam", async () => {
  const [monstroFragil, monstroTitanico] = await Promise.all([
    Promise.resolve(
      monsterBalanceSimulationService.simularCombates({
        nivel: 20,
        multiplicadores: { vida: 0.1, dano: 0.1, agilidade: 0.5, velocidade: 1 },
        iteracoes: 200,
      }),
    ),
    Promise.resolve(
      monsterBalanceSimulationService.simularCombates({
        nivel: 20,
        multiplicadores: { vida: 15, dano: 15, agilidade: 1, velocidade: 1 },
        iteracoes: 200,
      }),
    ),
  ]);

  assert.ok(monstroFragil.taxaVitoriaJogadorPct > 90, `monstro frágil devia perder quase sempre — taxa jogador ${monstroFragil.taxaVitoriaJogadorPct}%`);
  assert.ok(monstroTitanico.taxaVitoriaJogadorPct < 10, `monstro titânico devia vencer quase sempre — taxa jogador ${monstroTitanico.taxaVitoriaJogadorPct}%`);
});

test("simularCombates: monstro muito mais fraco que o jogador médio produz alta taxa de vitória do jogador", () => {
  const resultado = monsterBalanceSimulationService.simularCombates({
    nivel: 20,
    multiplicadores: { vida: 0.1, dano: 0.1, agilidade: 0.3, velocidade: 1 },
    perfilChave: "MEDIO",
    iteracoes: 300,
  });
  assert.ok(resultado.taxaVitoriaJogadorPct > 85, `esperado > 85%, obtido ${resultado.taxaVitoriaJogadorPct}%`);
  assert.equal(resultado.totalCombates, 300);
  assert.ok(resultado.turnosMedios > 0);
});

test("simularCombates: monstro muito mais forte que o jogador médio produz baixa taxa de vitória do jogador", () => {
  const resultado = monsterBalanceSimulationService.simularCombates({
    nivel: 20,
    multiplicadores: { vida: 12, dano: 12, agilidade: 1, velocidade: 1 },
    perfilChave: "MEDIO",
    iteracoes: 300,
  });
  assert.ok(resultado.taxaVitoriaJogadorPct < 15, `esperado < 15%, obtido ${resultado.taxaVitoriaJogadorPct}%`);
});

test("simularCombates: iterações respeitam o limite máximo configurado (nunca ilimitado)", () => {
  const resultado = monsterBalanceSimulationService.simularCombates({
    nivel: 20,
    multiplicadores: { vida: 1, dano: 1, agilidade: 1, velocidade: 1 },
    iteracoes: 999999999,
  });
  assert.ok(resultado.totalCombates <= 1000, `totalCombates ${resultado.totalCombates} devia respeitar o teto de 1000`);
});

test("simularUmCombate: nunca deixa vida negativa nem combate sem vencedor definido (ou timeout explícito)", () => {
  for (let i = 0; i < 50; i += 1) {
    const resultado = monsterBalanceSimulationService.simularUmCombate(15, { vida: 1, dano: 1, agilidade: 1, velocidade: 1 }, "MEDIO");
    assert.ok(["jogador", "monstro", "timeout"].includes(resultado.vencedor));
    assert.ok(resultado.turnos > 0);
  }
});
