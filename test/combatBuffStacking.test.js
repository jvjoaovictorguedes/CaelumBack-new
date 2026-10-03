// Habilidades V2.0 (item 3) — generaliza combatBuffService.aplicarBuff
// pra aceitar stack_group/reapply_policy/max_stacks (opcionais, dentro
// do ConsumableEffect.config JSONB — nenhuma migration nova), reusando
// o MESMO catálogo de políticas de combatModifierConfig que
// combatModifierService já usa pros PowerCombatEffect passivos. Puro,
// sem banco.
const test = require("node:test");
const assert = require("node:assert/strict");

const combatBuffService = require("../src/services/combatBuffService");

test("sem stack_group: comportamento ORIGINAL intocado — uma instância por atributo, a mais forte vence", () => {
  let lista = combatBuffService.aplicarBuff([], {
    atributo: "DANO_SAIDA_PCT",
    valor: 15,
    remainingTurns: 3,
  });
  assert.equal(combatBuffService.somaDeAtributo(lista, "DANO_SAIDA_PCT"), 15);

  // Elixir mais fraco bebido por cima — descartado, nunca derruba o buff bom.
  lista = combatBuffService.aplicarBuff(lista, {
    atributo: "DANO_SAIDA_PCT",
    valor: 10,
    remainingTurns: 3,
  });
  assert.equal(combatBuffService.somaDeAtributo(lista, "DANO_SAIDA_PCT"), 15, "nunca soma (15+10=25 seria o bug antigo)");
  assert.equal(lista.length, 1);

  // Elixir mais forte substitui por completo.
  lista = combatBuffService.aplicarBuff(lista, {
    atributo: "DANO_SAIDA_PCT",
    valor: 30,
    remainingTurns: 5,
  });
  assert.equal(combatBuffService.somaDeAtributo(lista, "DANO_SAIDA_PCT"), 30);
  assert.equal(lista.length, 1);
});

test("stack_group ausente exige reapply_policy só quando presente (erro claro se faltar)", () => {
  assert.throws(
    () =>
      combatBuffService.aplicarBuff([], {
        atributo: "DANO_SAIDA_PCT",
        valor: 10,
        remainingTurns: 3,
        stack_group: "POCOES_DE_FORCA",
      }),
    /reapply_policy/,
  );
});

test("STACK: várias instâncias do grupo coexistem e somam via somaDeAtributo, até max_stacks", () => {
  let lista = [];
  for (let i = 0; i < 4; i += 1) {
    lista = combatBuffService.aplicarBuff(lista, {
      atributo: "DANO_SAIDA_PCT",
      valor: 5,
      remainingTurns: 3,
      stack_group: "POCOES_DE_FORCA",
      reapply_policy: "STACK",
      max_stacks: 3,
    });
  }
  assert.equal(lista.length, 3, "nunca passa de max_stacks mesmo aplicado 4 vezes");
  assert.equal(combatBuffService.somaDeAtributo(lista, "DANO_SAIDA_PCT"), 15, "3 instâncias de 5 somam 15 (nunca STRONGEST aqui)");
});

test("STACK: ao exceder max_stacks, mantém as de MAIOR magnitude (nunca as mais antigas por acaso)", () => {
  let lista = [];
  for (const valor of [5, 20, 3, 10]) {
    lista = combatBuffService.aplicarBuff(lista, {
      atributo: "DANO_SAIDA_PCT",
      valor,
      remainingTurns: 3,
      stack_group: "G",
      reapply_policy: "STACK",
      max_stacks: 2,
    });
  }
  const valores = lista.map((b) => b.valor).sort((a, b) => b - a);
  assert.deepEqual(valores, [20, 10], "mantém as 2 maiores (20 e 10), descarta 5 e 3");
});

test("BLOCK_WHILE_ACTIVE: nova aplicação não faz nada enquanto o grupo tiver instância ativa", () => {
  let lista = combatBuffService.aplicarBuff([], {
    atributo: "DEFESA_FLAT",
    valor: 10,
    remainingTurns: 3,
    stack_group: "ESCUDO_TEMPORARIO",
    reapply_policy: "BLOCK_WHILE_ACTIVE",
  });
  const antes = lista;
  lista = combatBuffService.aplicarBuff(lista, {
    atributo: "DEFESA_FLAT",
    valor: 50,
    remainingTurns: 10,
    stack_group: "ESCUDO_TEMPORARIO",
    reapply_policy: "BLOCK_WHILE_ACTIVE",
  });
  assert.deepEqual(lista, antes, "nunca muda enquanto o grupo já tem instância ativa, nem pra um valor maior");
});

test("REFRESH: mantém a magnitude existente, só renova a duração", () => {
  let lista = combatBuffService.aplicarBuff([], {
    atributo: "DANO_SAIDA_PCT",
    valor: 15,
    remainingTurns: 1,
    stack_group: "BUFF_DE_GUERRA",
    reapply_policy: "REFRESH",
  });
  lista = combatBuffService.aplicarBuff(lista, {
    atributo: "DANO_SAIDA_PCT",
    valor: 999, // irrelevante — REFRESH nunca usa o novo valor
    remainingTurns: 5,
    stack_group: "BUFF_DE_GUERRA",
    reapply_policy: "REFRESH",
  });
  assert.equal(lista.length, 1);
  assert.equal(lista[0].valor, 15, "mantém a magnitude original");
  assert.equal(lista[0].remainingTurns, 5, "renova a duração pra 5");
});

test("REPLACE: a nova aplicação substitui valor E duração, sem olhar qual é mais forte", () => {
  let lista = combatBuffService.aplicarBuff([], {
    atributo: "DANO_SAIDA_PCT",
    valor: 50,
    remainingTurns: 10,
    stack_group: "G",
    reapply_policy: "REPLACE",
  });
  lista = combatBuffService.aplicarBuff(lista, {
    atributo: "DANO_SAIDA_PCT",
    valor: 5, // mais fraco, mas REPLACE substitui de qualquer jeito
    remainingTurns: 1,
    stack_group: "G",
    reapply_policy: "REPLACE",
  });
  assert.equal(lista.length, 1);
  assert.equal(lista[0].valor, 5);
  assert.equal(lista[0].remainingTurns, 1);
});

test("STRONGEST: mantém a maior magnitude do grupo, nunca soma", () => {
  let lista = combatBuffService.aplicarBuff([], {
    atributo: "DANO_SAIDA_PCT",
    valor: 20,
    remainingTurns: 3,
    stack_group: "G",
    reapply_policy: "STRONGEST",
  });
  // Mais fraco — descartado.
  lista = combatBuffService.aplicarBuff(lista, {
    atributo: "DANO_SAIDA_PCT",
    valor: 10,
    remainingTurns: 10,
    stack_group: "G",
    reapply_policy: "STRONGEST",
  });
  assert.equal(lista[0].valor, 20);
  assert.equal(lista[0].remainingTurns, 3, "duração do vencedor original, nunca a do descartado");

  // Mais forte — substitui valor E duração.
  lista = combatBuffService.aplicarBuff(lista, {
    atributo: "DANO_SAIDA_PCT",
    valor: 35,
    remainingTurns: 7,
    stack_group: "G",
    reapply_policy: "STRONGEST",
  });
  assert.equal(lista[0].valor, 35);
  assert.equal(lista[0].remainingTurns, 7);
  assert.equal(lista.length, 1);
});

test("UNIQUE_SOURCE: fontes diferentes coexistem no mesmo grupo, a MESMA fonte reaplicando substitui só a própria instância", () => {
  let lista = combatBuffService.aplicarBuff([], {
    atributo: "DANO_SAIDA_PCT",
    valor: 10,
    remainingTurns: 3,
    stack_group: "POCOES_UNICAS",
    reapply_policy: "UNIQUE_SOURCE",
    sourceItemId: 1,
  });
  lista = combatBuffService.aplicarBuff(lista, {
    atributo: "DANO_SAIDA_PCT",
    valor: 15,
    remainingTurns: 3,
    stack_group: "POCOES_UNICAS",
    reapply_policy: "UNIQUE_SOURCE",
    sourceItemId: 2,
  });
  assert.equal(lista.length, 2, "fontes diferentes (item 1 e item 2) coexistem");
  assert.equal(combatBuffService.somaDeAtributo(lista, "DANO_SAIDA_PCT"), 25);

  // Reaplica a fonte 1 com valor diferente — substitui só a instância dela.
  lista = combatBuffService.aplicarBuff(lista, {
    atributo: "DANO_SAIDA_PCT",
    valor: 50,
    remainingTurns: 1,
    stack_group: "POCOES_UNICAS",
    reapply_policy: "UNIQUE_SOURCE",
    sourceItemId: 1,
  });
  assert.equal(lista.length, 2, "ainda 2 instâncias (1 por fonte)");
  assert.equal(combatBuffService.somaDeAtributo(lista, "DANO_SAIDA_PCT"), 65, "50 (fonte 1 atualizada) + 15 (fonte 2 intacta)");
});

test("grupos diferentes nunca interferem entre si", () => {
  let lista = combatBuffService.aplicarBuff([], {
    atributo: "DANO_SAIDA_PCT",
    valor: 10,
    remainingTurns: 3,
    stack_group: "A",
    reapply_policy: "STACK",
    max_stacks: 5,
  });
  lista = combatBuffService.aplicarBuff(lista, {
    atributo: "DANO_SAIDA_PCT",
    valor: 20,
    remainingTurns: 3,
    stack_group: "B",
    reapply_policy: "STRONGEST",
  });
  assert.equal(lista.length, 2);
  assert.equal(combatBuffService.somaDeAtributo(lista, "DANO_SAIDA_PCT"), 30);
});
