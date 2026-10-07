// Habilidades V2.0 (item 7) — gatilhos reativos ON_HIT/ON_KILL do
// PowerCombatEffect, escopo "regen on-proc": REGEN_HP_FLAT/PERCENT e
// REGEN_MANA_FLAT/PERCENT viram cura/restauração instantânea ao
// acertar/matar (chance_ppm decide se procou), reaproveitando os
// MESMOS effect_keys do regen passivo por turno — nenhum effect_key
// novo, nenhuma migration nova.
const test = require("node:test");
const assert = require("node:assert/strict");

const combatModifierService = require("../src/services/combatModifierService");
const { aplicarAcao } = require("../src/services/duelEngine");

test("resolverGatilhosDoPersonagem: personagem sem id devolve Map vazio por trigger (nunca quebra)", async () => {
  const resultado = await combatModifierService.resolverGatilhosDoPersonagem(null, "PVP_CASUAL");
  assert.deepEqual([...resultado.keys()].sort(), require("../src/services/combatModifierService").TRIGGERS_REATIVOS_SUPORTADOS.toSorted());
  assert.equal(resultado.get("ON_HIT").length, 0);
  assert.equal(resultado.get("ON_KILL").length, 0);
});

test("processarGatilho: chance_ppm=1_000_000 sempre proca, chance_ppm=0 nunca proca", () => {
  const sempre = combatModifierService.processarGatilho([
    { effect_key: "REGEN_HP_FLAT", magnitude: 10, chance_ppm: 1_000_000 },
  ]);
  assert.equal(sempre.get("REGEN_HP_FLAT"), 10);

  const nunca = combatModifierService.processarGatilho([
    { effect_key: "REGEN_HP_FLAT", magnitude: 10, chance_ppm: 0 },
  ]);
  assert.equal(nunca.get("REGEN_HP_FLAT"), undefined);
});

test("regenInstantanea: soma flat + percentual de vida/mana, mesma fórmula do regen por turno", () => {
  const mapa = new Map([
    ["REGEN_HP_FLAT", 5],
    ["REGEN_HP_PERCENT", 10],
    ["REGEN_MANA_FLAT", 2],
  ]);
  const resultado = combatModifierService.regenInstantanea(mapa, 100, 50);
  assert.equal(resultado.vida, 15); // 5 flat + 10% de 100
  assert.equal(resultado.mana, 2);
});

test("duelEngine.aplicarAcao: ON_HIT proca cura instantânea no atacante quando o golpe acerta", () => {
  const atacante = { forca: 10, agilidade: 0, velocidade: 0, vida_atual: 50, mana_atual: 0 };
  const defensor = { agilidade: 0, defesa: 0, vida_atual: 100 };
  const gatilhosAtacante = new Map([
    ["ON_HIT", [{ effect_key: "REGEN_HP_FLAT", magnitude: 7, chance_ppm: 1_000_000 }]],
    ["ON_KILL", []],
  ]);

  const randomOriginal = Math.random;
  try {
    // 0.9 fica acima do teto de esquiva (35%) e do piso de crítico (5%),
    // então o golpe sempre acerta sem crítico — mock simples e
    // determinístico, sem depender da ordem das chamadas de Math.random.
    Math.random = () => 0.9;
    const resultado = aplicarAcao({
      atacante,
      defensor,
      acao: { tipo: "attack" },
      vidaMaxAtacante: 100,
      manaMaxAtacante: 10,
      gatilhosAtacante,
    });
    assert.ok(resultado.dano > 0, "ataque básico precisa ter acertado com dano");
  } finally {
    Math.random = randomOriginal;
  }
  assert.equal(atacante.vida_atual, 57, "curou os 7 de REGEN_HP_FLAT do proc ON_HIT");
});

test("duelEngine.aplicarAcao: ON_KILL só proca quando o golpe derruba o defensor a 0", () => {
  const atacante = { forca: 100, agilidade: 0, velocidade: 0, vida_atual: 50, mana_atual: 0 };
  const defensorQuaseMorto = { agilidade: 0, defesa: 0, vida_atual: 1 };
  const gatilhosAtacante = new Map([
    ["ON_HIT", []],
    ["ON_KILL", [{ effect_key: "REGEN_HP_FLAT", magnitude: 20, chance_ppm: 1_000_000 }]],
  ]);

  const randomOriginal = Math.random;
  try {
    Math.random = () => 0.9;
    aplicarAcao({
      atacante,
      defensor: defensorQuaseMorto,
      acao: { tipo: "attack" },
      vidaMaxAtacante: 100,
      manaMaxAtacante: 10,
      gatilhosAtacante,
    });
  } finally {
    Math.random = randomOriginal;
  }
  assert.equal(defensorQuaseMorto.vida_atual, 0, "golpe matou o defensor");
  assert.equal(atacante.vida_atual, 70, "ON_KILL procou (20 de cura) porque este golpe foi o que matou");
});

test("duelEngine.aplicarAcao: sem gatilhosAtacante (default), comportamento idêntico a antes (sem cura extra)", () => {
  const atacante = { forca: 10, agilidade: 0, velocidade: 0, vida_atual: 50, mana_atual: 0 };
  const defensor = { agilidade: 0, defesa: 0, vida_atual: 100 };

  const randomOriginal = Math.random;
  try {
    Math.random = () => 0;
    aplicarAcao({
      atacante,
      defensor,
      acao: { tipo: "attack" },
      vidaMaxAtacante: 100,
      manaMaxAtacante: 10,
    });
  } finally {
    Math.random = randomOriginal;
  }
  assert.equal(atacante.vida_atual, 50, "sem gatilhos configurados, nenhuma cura extra aparece");
});
