// Regeneração passiva de vida/mana — as duas passaram de 12h para
// 30min pra regenerar 0% -> 100% (pedido explícito do usuário).
const test = require("node:test");
const assert = require("node:assert/strict");

const regenService = require("../src/services/regenService");

test("DURACAO_REGEN_VIDA_MS é 30 minutos", () => {
  assert.equal(regenService.DURACAO_REGEN_VIDA_MS, 30 * 60 * 1000);
});

test("DURACAO_REGEN_MANA_MS também é 30 minutos", () => {
  assert.equal(regenService.DURACAO_REGEN_MANA_MS, 30 * 60 * 1000);
});

test("sincronizarRegeneracaoDeVida: 15min decorridos regenera ~50% da vida (duração de 30min)", () => {
  const agora = Date.now();
  const character = {
    vida_atual: 0,
    ultima_atualizacao_vida: new Date(agora - 15 * 60 * 1000),
  };
  const personagemEfetivo = { vida_atual: 0, nivel: 1, forca: 0, vitalidade: 0, agilidade: 0, inteligencia: 0, velocidade: 0 };

  const mudou = regenService.sincronizarRegeneracaoDeVida(character, personagemEfetivo);
  assert.equal(mudou, true);

  const { vidaMaximaDe } = require("../src/services/combatFormulas");
  const maximo = vidaMaximaDe(personagemEfetivo);
  const esperado = Math.round(maximo * 0.5);
  // Tolerância de 1 pra arredondamento de Math.round em cada ponta.
  assert.ok(Math.abs(character.vida_atual - esperado) <= 1, `esperava ~${esperado}, veio ${character.vida_atual}`);
});

test("sincronizarRegeneracaoDeVida: 30min decorridos regenera 100% da vida", () => {
  const agora = Date.now();
  const character = {
    vida_atual: 1,
    ultima_atualizacao_vida: new Date(agora - 30 * 60 * 1000),
  };
  const personagemEfetivo = { vida_atual: 1, nivel: 1, forca: 0, vitalidade: 0, agilidade: 0, inteligencia: 0, velocidade: 0 };

  regenService.sincronizarRegeneracaoDeVida(character, personagemEfetivo);

  const { vidaMaximaDe } = require("../src/services/combatFormulas");
  assert.equal(character.vida_atual, vidaMaximaDe(personagemEfetivo));
});

test("sincronizarRegeneracaoDeMana: 30min decorridos regenera 100% da mana", () => {
  const agora = Date.now();
  const character = {
    mana_atual: 0,
    ultima_atualizacao_mana: new Date(agora - 30 * 60 * 1000),
  };
  const personagemEfetivo = { mana_atual: 0, nivel: 1, forca: 0, vitalidade: 0, agilidade: 0, inteligencia: 0, velocidade: 0 };

  regenService.sincronizarRegeneracaoDeMana(character, personagemEfetivo);

  const { manaMaximaDe } = require("../src/services/combatFormulas");
  assert.equal(character.mana_atual, manaMaximaDe(personagemEfetivo));
});

test("msAteVidaRegenCompleta: vida pela metade falta ~15min (duração de 30min)", () => {
  const { vidaMaximaDe } = require("../src/services/combatFormulas");
  const personagemEfetivo = { nivel: 1, forca: 0, vitalidade: 0, agilidade: 0, inteligencia: 0, velocidade: 0 };
  personagemEfetivo.vida_atual = Math.round(vidaMaximaDe(personagemEfetivo) / 2);

  const faltamMs = regenService.msAteVidaRegenCompleta(personagemEfetivo);
  const esperadoMs = 15 * 60 * 1000;
  assert.ok(Math.abs(faltamMs - esperadoMs) <= 2000, `esperava ~${esperadoMs}ms, veio ${faltamMs}ms`);
});
