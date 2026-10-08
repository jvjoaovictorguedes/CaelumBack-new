// Templo do Véu Celestial — Fase 5: templeBossScalingService (§9.1/
// §9.2), núcleo puro/determinístico — sem banco, sem RNG.
const test = require("node:test");
const assert = require("node:assert/strict");

const { calcularStatsEscaladosDoBoss, faseAtivaPara } = require("../src/services/templeBossScalingService");

test("calcularStatsEscaladosDoBoss: escala vida pelo dpr e dano pelo ehp do jogador, respeitando clamps", () => {
  const bossBase = { vida_maxima: 1000, dano_min: 40, dano_max: 60, defesa: 20 };
  const scaling = {
    target_turns_to_kill: 8,
    target_boss_actions_survivable: 6,
    scaling_min_multiplier: 0.5,
    scaling_max_multiplier: 3,
  };

  const statsFraco = calcularStatsEscaladosDoBoss({ playerSnapshot: { dpr: 50, ehp: 300 }, bossBase, scaling });
  // vidaMaximaAlvo = 50*8=400; clamp[500,3000] -> 500 (piso)
  assert.equal(statsFraco.vida_maxima, 500);
  assert.equal(statsFraco.defesa, 20, "defesa é identidade fixa do Guardião, nunca escalada");

  const statsForte = calcularStatsEscaladosDoBoss({ playerSnapshot: { dpr: 2000, ehp: 50000 }, bossBase, scaling });
  // vidaMaximaAlvo = 2000*8=16000; clamp[500,3000] -> 3000 (teto)
  assert.equal(statsForte.vida_maxima, 3000);
});

test("calcularStatsEscaladosDoBoss: dano_min/dano_max mantêm um spread de +-15% em volta do dano médio alvo", () => {
  const bossBase = { vida_maxima: 1000, dano_min: 40, dano_max: 60, defesa: 10 };
  const scaling = {
    target_turns_to_kill: 8,
    target_boss_actions_survivable: 5,
    scaling_min_multiplier: 0.5,
    scaling_max_multiplier: 3,
  };
  // danoMedioAlvo = ehp/5 = 1000/5 = 200; base danoMedio=(40+60)/2=50;
  // clamp[25,150] -> 150 (teto)
  const stats = calcularStatsEscaladosDoBoss({ playerSnapshot: { dpr: 10, ehp: 1000 }, bossBase, scaling });
  assert.equal(stats.dano_min, Math.round(150 * 0.85));
  assert.equal(stats.dano_max, Math.round(150 * 1.15));
  assert.ok(stats.dano_min <= stats.dano_max);
});

test("calcularStatsEscaladosDoBoss: nunca produz vida/dano <= 0 mesmo com snapshot degenerado", () => {
  const bossBase = { vida_maxima: 0, dano_min: 0, dano_max: 0, defesa: 0 };
  const scaling = {};
  const stats = calcularStatsEscaladosDoBoss({ playerSnapshot: { dpr: 0, ehp: 0 }, bossBase, scaling });
  assert.ok(stats.vida_maxima >= 1);
  assert.ok(stats.dano_min >= 1);
  assert.ok(stats.dano_max >= 1);
});

test("faseAtivaPara: devolve a fase mais severa cujo threshold ainda cobre o %HP atual", () => {
  const fases = [
    { ordem: 0, hp_threshold_pct: 100, nome_exibicao: "Fase 1" },
    { ordem: 1, hp_threshold_pct: 50, nome_exibicao: "Fase 2" },
    { ordem: 2, hp_threshold_pct: 20, nome_exibicao: "Fase 3" },
  ];
  assert.equal(faseAtivaPara(fases, 100).nome_exibicao, "Fase 1");
  assert.equal(faseAtivaPara(fases, 60).nome_exibicao, "Fase 1");
  assert.equal(faseAtivaPara(fases, 35).nome_exibicao, "Fase 2");
  assert.equal(faseAtivaPara(fases, 15).nome_exibicao, "Fase 3");
});

test("faseAtivaPara: sem fases configuradas, devolve null (Guardião sem fase nenhuma)", () => {
  assert.equal(faseAtivaPara([], 50), null);
});
