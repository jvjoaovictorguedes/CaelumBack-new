// Boss da Guilda ao vivo — cooldown real de Powers (correção: antes
// desta mudança, guildBossSocket.js não tinha NENHUM cooldown de
// habilidade, diferente de todo outro combate do jogo). Testa as duas
// funções PURAS extraídas de guildBossSocket.js (podeUsarPoderNaBatalha/
// registrarUsoDePoder), que só envelopam cooldownService.js — o MESMO
// motor que worldBossCombatService.js (Boss Mundial) e
// combatController.js (Aventura solo) usam. Sem banco/socket: mesmo
// espírito de test/cooldownService.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");

const { podeUsarPoderNaBatalha, registrarUsoDePoder } = require("../src/socket/guildBossSocket");

function novoAtacante() {
  return { cooldowns: {} };
}

test("Power com cooldown NÃO pode ser reusado no turno seguinte do mesmo ator", () => {
  const atacante = novoAtacante();
  const power = { id: 42, cooldown: 3 };

  assert.equal(podeUsarPoderNaBatalha(atacante, power), true, "primeiro uso sempre livre");
  registrarUsoDePoder(atacante, { tipo: "power", power });
  assert.equal(podeUsarPoderNaBatalha(atacante, power), false, "bloqueado logo depois de usar");

  // Simula os PRÓXIMOS turnos do MESMO ator: ataque básico só decrementa
  // (nunca reinicia) os cooldowns já ativos.
  registrarUsoDePoder(atacante, { tipo: "attack" });
  assert.equal(podeUsarPoderNaBatalha(atacante, power), false, "ainda em cooldown (restam 2 turnos)");
  registrarUsoDePoder(atacante, { tipo: "attack" });
  assert.equal(podeUsarPoderNaBatalha(atacante, power), false, "ainda em cooldown (resta 1 turno)");
  registrarUsoDePoder(atacante, { tipo: "attack" });
  assert.equal(podeUsarPoderNaBatalha(atacante, power), true, "liberado depois de exatamente 3 turnos bloqueados");
});

test("dois ataques 'rápidos' com o mesmo Power: o segundo é bloqueado (nunca dobra o efeito)", () => {
  // Simula exatamente o cenário do bug reportado: jogador tenta usar a
  // MESMA habilidade de novo imediatamente (sem esperar nenhum turno).
  const atacante = novoAtacante();
  const powerForte = { id: 7, cooldown: 2 };

  assert.equal(podeUsarPoderNaBatalha(atacante, powerForte), true);
  registrarUsoDePoder(atacante, { tipo: "power", power: powerForte });

  // "Ataque rápido" nº2 — o servidor (guildboss:acao) consultaria
  // podeUsarPoderNaBatalha ANTES de aceitar a ação; aqui confirmamos que
  // a consulta já devolve bloqueado, sem precisar reprocessar a ação.
  assert.equal(podeUsarPoderNaBatalha(atacante, powerForte), false, "segunda tentativa imediata é bloqueada");
});

test("Power sem cooldown configurado (0/undefined) nunca bloqueia", () => {
  const atacante = novoAtacante();
  const powerLivre = { id: 1, cooldown: 0 };
  registrarUsoDePoder(atacante, { tipo: "power", power: powerLivre });
  assert.equal(podeUsarPoderNaBatalha(atacante, powerLivre), true);
  assert.deepEqual(atacante.cooldowns, {}, "cooldown 0 nunca entra no mapa (mesmo contrato de cooldownService)");
});

test("cooldowns de atores diferentes são independentes (Map por characterId na batalha real)", () => {
  const atacanteA = novoAtacante();
  const atacanteB = novoAtacante();
  const power = { id: 10, cooldown: 2 };

  registrarUsoDePoder(atacanteA, { tipo: "power", power });
  assert.equal(podeUsarPoderNaBatalha(atacanteA, power), false, "A está em cooldown");
  assert.equal(podeUsarPoderNaBatalha(atacanteB, power), true, "B nunca usou — nada bloqueado pra ele");
});

test("ataque básico nunca precisa de cooldown (só decrementa os já ativos)", () => {
  const atacante = novoAtacante();
  registrarUsoDePoder(atacante, { tipo: "attack" });
  assert.deepEqual(atacante.cooldowns, {});
});
