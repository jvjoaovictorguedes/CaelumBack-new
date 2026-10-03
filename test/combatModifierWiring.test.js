// Habilidades V2.0 (item 7/8) — achado nesta revisão: combatModifierService
// já expunha getters pra CRIT_CHANCE_PCT/CRIT_DAMAGE_PCT/DODGE_CHANCE_PCT/
// HIT_CHANCE_PCT/LIFESTEAL_PCT desde a Fase 4, mas NENHUMA fórmula de
// combate (combatFormulas.js) os lia de verdade — um PowerCombatEffect ou
// ClassEvolutionEffect desses 5 effect_keys não tinha efeito NENHUM no
// jogo. Este arquivo trava que agora têm: puro, sem banco, sem RNG (usa
// Math.random mockado onde precisa de determinismo).
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  probabilidadeDeCritico,
  calcularDanoBasico,
  probabilidadeDeEsquiva,
  resolverResultadoDeAcerto,
  MULTIPLICADOR_DANO_CRITICO,
} = require("../src/services/combatFormulas");
const combatModifierService = require("../src/services/combatModifierService");

test("probabilidadeDeCritico soma CRIT_CHANCE_PCT (combatModifierService) à chance base", () => {
  const atacante = { velocidade: 0 };
  const semBonus = probabilidadeDeCritico(atacante);
  const comBonus = probabilidadeDeCritico(atacante, new Map([["CRIT_CHANCE_PCT", 20]]));
  assert.ok(comBonus > semBonus, "bônus de crítico precisa elevar a chance");
  assert.equal(Math.round((comBonus - semBonus) * 100) / 100, 0.2, "20 pontos percentuais exatos");
});

test("calcularDanoBasico: CRIT_DAMAGE_PCT soma em cima do multiplicador base quando crítico", () => {
  const randomOriginal = Math.random;
  try {
    // Força crítico (probabilidadeDeCritico > 0) e variação de arma neutra.
    Math.random = () => 0;
    const atacante = { forca: 10, velocidade: 1000 }; // velocidade alta satura CHANCE_CRITICO_MAXIMA
    const contexto = {};
    const danoSemBonus = calcularDanoBasico(atacante, contexto);
    assert.equal(contexto.critico, true, "com Math.random=0 e velocidade alta, crítico sempre acontece");

    const contexto2 = {};
    const danoComBonus = calcularDanoBasico(atacante, contexto2, new Map([["CRIT_DAMAGE_PCT", 50]]));
    assert.ok(danoComBonus > danoSemBonus, "CRIT_DAMAGE_PCT precisa aumentar o dano crítico de verdade");
  } finally {
    Math.random = randomOriginal;
  }
});

test("probabilidadeDeEsquiva: DODGE_CHANCE_PCT do defensor soma, HIT_CHANCE_PCT do atacante subtrai", () => {
  const defensor = { agilidade: 5 };
  const atacante = { agilidade: 5, velocidade: 0 };
  const base = probabilidadeDeEsquiva(defensor, atacante);

  const comEsquiva = probabilidadeDeEsquiva(defensor, atacante, new Map([["DODGE_CHANCE_PCT", 10]]));
  assert.ok(comEsquiva > base, "DODGE_CHANCE_PCT do defensor aumenta a esquiva");

  const comAcertoAtacante = probabilidadeDeEsquiva(
    defensor,
    atacante,
    new Map(),
    new Map([["HIT_CHANCE_PCT", 10]]),
  );
  assert.ok(comAcertoAtacante < base, "HIT_CHANCE_PCT do atacante reduz a esquiva do defensor");
});

test("resolverResultadoDeAcerto propaga os Maps de modificador pra probabilidadeDeEsquiva (nunca ignora)", () => {
  const randomOriginal = Math.random;
  try {
    // Esquiva é sempre tetada em 35% (ver probabilidadeDeEsquiva) mesmo
    // com DODGE_CHANCE_PCT=100 — Math.random=0 garante que qualquer
    // chance > 0 dispara a esquiva, sem depender desse teto.
    Math.random = () => 0;
    const resultado = resolverResultadoDeAcerto({
      atacante: { agilidade: 0, velocidade: 0 },
      defensor: { agilidade: 0 },
      modificadoresDefensor: new Map([["DODGE_CHANCE_PCT", 100]]),
    });
    assert.equal(resultado.hit, false);
    assert.equal(resultado.reason, "DODGE");
  } finally {
    Math.random = randomOriginal;
  }
});

test("combatModifierService.curaPorLifesteal: usa o dano EFETIVO na vida, nunca o bruto", () => {
  const mapa = new Map([["LIFESTEAL_PCT", 50]]);
  assert.equal(combatModifierService.curaPorLifesteal(mapa, 100), 50);
  assert.equal(combatModifierService.curaPorLifesteal(mapa, 0), 0, "dano zero nunca cura por lifesteal");
  assert.equal(combatModifierService.curaPorLifesteal(new Map(), 100), 0, "sem LIFESTEAL_PCT, zero");
});

test("MULTIPLICADOR_DANO_CRITICO continua 1.5 (nenhuma mudança na base, só soma por cima)", () => {
  assert.equal(MULTIPLICADOR_DANO_CRITICO, 1.5);
});
