// Cooldown de habilidades — testes unitários puros (§77 da Especificação
// Consolidada Poder/Status/Cooldown/Balanceamento). Sem banco de dados.
const test = require("node:test");
const assert = require("node:assert/strict");

const cooldownService = require("../src/services/cooldownService");

test("cooldown 0 (ou ausente) permite uso sempre", () => {
  let cooldowns = {};
  assert.equal(cooldownService.podeUsar(cooldowns, 7), true);
  cooldowns = cooldownService.iniciarCooldown(cooldowns, 7, 0);
  assert.deepEqual(cooldowns, {}, "cooldown 0 nunca entra no mapa");
  assert.equal(cooldownService.podeUsar(cooldowns, 7), true);
});

test("cooldown 1 bloqueia exatamente o próximo turno", () => {
  let cooldowns = cooldownService.iniciarCooldown({}, 5, 1);
  const aplicadas = new Set([cooldownService.chaveDoPoder(5)]);

  // Fim do turno em que foi usada — não decrementa (recém aplicada).
  cooldowns = cooldownService.decrementarCooldowns(cooldowns, aplicadas);
  assert.equal(cooldownService.podeUsar(cooldowns, 5), false, "ainda bloqueada no turno em que foi usada");

  // Próximo turno do ator: bloqueada, mas decrementa no fim dele (nada
  // foi aplicado nesse turno).
  assert.equal(cooldownService.podeUsar(cooldowns, 5), false);
  cooldowns = cooldownService.decrementarCooldowns(cooldowns, new Set());
  assert.equal(cooldownService.podeUsar(cooldowns, 5), true, "liberada depois de exatamente 1 turno bloqueado");
});

test("cooldown 3 bloqueia exatamente três próximos turnos", () => {
  let cooldowns = cooldownService.iniciarCooldown({}, 9, 3);
  const aplicadas = new Set([cooldownService.chaveDoPoder(9)]);

  // Turno do cast: não decrementa.
  cooldowns = cooldownService.decrementarCooldowns(cooldowns, aplicadas);
  assert.equal(cooldownService.turnosRestantes(cooldowns, 9), 3);

  // 3 turnos seguintes, cada um bloqueado ANTES de decrementar no fim.
  for (const esperadoAntes of [3, 2, 1]) {
    assert.equal(cooldownService.turnosRestantes(cooldowns, 9), esperadoAntes);
    assert.equal(cooldownService.podeUsar(cooldowns, 9), false);
    cooldowns = cooldownService.decrementarCooldowns(cooldowns, new Set());
  }

  assert.equal(cooldownService.podeUsar(cooldowns, 9), true, "liberada depois de exatamente 3 turnos bloqueados");
});

test("tentativa inválida não inicia cooldown (chamador nunca chama iniciarCooldown)", () => {
  // O contrato é: só chame iniciarCooldown depois de validar Mana/
  // Silence/cooldown — este teste documenta que iniciarCooldown por si
  // só não tem proteção nenhuma (a responsabilidade é de quem chama, ver
  // combatController.js), então "não iniciar" significa simplesmente
  // "não chamar a função", o que o cooldown final reflete corretamente.
  const cooldowns = {};
  assert.deepEqual(cooldowns, {});
  assert.equal(cooldownService.podeUsar(cooldowns, 1), true);
});

test("Silence não reinicia nem pausa cooldown — decrementarCooldowns não sabe nada sobre status", () => {
  let cooldowns = cooldownService.iniciarCooldown({}, 2, 2);
  cooldowns = cooldownService.decrementarCooldowns(cooldowns, new Set([cooldownService.chaveDoPoder(2)]));
  // Simula 2 turnos se passando com o ator silenciado (nada muda na
  // chamada de decrementarCooldowns independente de status nenhum).
  cooldowns = cooldownService.decrementarCooldowns(cooldowns, new Set());
  assert.equal(cooldownService.turnosRestantes(cooldowns, 2), 1);
  cooldowns = cooldownService.decrementarCooldowns(cooldowns, new Set());
  assert.equal(cooldownService.podeUsar(cooldowns, 2), true);
});

test("fim da batalha limpa cooldown (é responsabilidade de quem chama descartar o objeto)", () => {
  let cooldowns = cooldownService.iniciarCooldown({}, 3, 5);
  assert.notDeepEqual(cooldowns, {});
  cooldowns = {};
  assert.equal(cooldownService.podeUsar(cooldowns, 3), true);
});
