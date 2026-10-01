// Alquimia/Caldeirão V2 (spec §13) — combatBuffService + ConsumableEffect
// APPLY_COMBAT_BUFF. Cobre, nesta ordem: o service isolado (puro, sem
// banco), o handler do registry, e os 2 pontos de integração reais
// (combate PvE solo via combatController.js, e PvP/Grupo via
// duelEngine.js) — provando que o buff soma no cálculo de dano/defesa
// certo, dura exatamente duration_turns turnos, e nunca sobrevive além
// disso.
const test = require("node:test");
const assert = require("node:assert/strict");

// test/helpers/db SEMPRE primeiro — é quem troca DATABASE_URL pro
// TEST_DATABASE_URL antes de qualquer outro require inicializar a
// conexão real do Sequelize (config/database.js é um singleton: a
// primeira URL que ele vir é a que fica pro processo inteiro).
// duelEngine.js carrega combatEffectResolver.js -> models/
// PowerStatusEffect.js por baixo dos panos, então precisa vir DEPOIS.
const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");
const combatBuffService = require("../src/services/combatBuffService");
const { executarEfeito } = require("../src/services/consumableEffectRegistry");
const { aplicarAcao, resolverTurnoComStatus } = require("../src/services/duelEngine");
const Item = require("../src/models/Item");
const ConsumableProperties = require("../src/models/ConsumableProperties");
const ConsumableEffect = require("../src/models/ConsumableEffect");
const CharacterInventory = require("../src/models/CharacterInventory");
const combatController = require("../src/controllers/combatController");

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

const itensCriados = [];
test.after(async () => {
  if (!temBanco) return;
  if (itensCriados.length > 0) {
    await ConsumableEffect.destroy({ where: { id_item: itensCriados } });
    await ConsumableProperties.destroy({ where: { id_item: itensCriados } });
    await Item.destroy({ where: { id: itensCriados } });
  }
  await sequelize.close();
});

// Mesmo truque de test/duelEngineLifesteal.test.js — aplicarAcao (e os
// trechos de resolverTurnoComStatus que não dependem do banco) são
// funções puras o bastante pra controlar Math.random direto e tornar
// acerto/crítico/variação de dano 100% determinísticos.
// Cuidado: `fn` pode ser assíncrona (resolverTurnoComStatus) e dar um
// `await` ANTES das rolagens de dado que este helper existe pra fixar —
// restaurar Math.random num `finally` síncrono destravaria o mock cedo
// demais, antes da Promise resolver de verdade. Sempre aguarda o
// resultado (funciona pra síncrono também) antes de restaurar.
async function comMathRandomFixo(valor, fn) {
  const original = Math.random;
  Math.random = () => valor;
  try {
    return await Promise.resolve(fn());
  } finally {
    Math.random = original;
  }
}

function personagemBase(overrides = {}) {
  return {
    nivel: 5,
    forca: 10,
    vitalidade: 10,
    inteligencia: 10,
    agilidade: 10,
    velocidade: 10,
    vida_atual: 200,
    mana_atual: 100,
    defesa: 0,
    multiplicador_dano_fisico: 1,
    multiplicador_dano_magico: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// combatBuffService (puro)
// ---------------------------------------------------------------------

test("aplicarBuff rejeita atributo fora da whitelist", () => {
  assert.throws(() => combatBuffService.aplicarBuff([], { atributo: "ISTO_NAO_EXISTE", valor: 10, remainingTurns: 2 }));
});

test("aplicarBuff rejeita duração <= 0", () => {
  assert.throws(() => combatBuffService.aplicarBuff([], { atributo: "DANO_SAIDA_PCT", valor: 10, remainingTurns: 0 }));
});

test("decrementarDuracoes decrementa e remove o que chegou a 0", () => {
  const lista = [
    { atributo: "DANO_SAIDA_PCT", valor: 10, remainingTurns: 2 },
    { atributo: "DEFESA_FLAT", valor: 5, remainingTurns: 1 },
  ];
  const depois = combatBuffService.decrementarDuracoes(lista);
  assert.equal(depois.length, 1);
  assert.equal(depois[0].atributo, "DANO_SAIDA_PCT");
  assert.equal(depois[0].remainingTurns, 1);
});

test("múltiplos buffs do mesmo atributo empilham (somam), cada um com sua própria duração", () => {
  let lista = combatBuffService.aplicarBuff([], { atributo: "DANO_SAIDA_PCT", valor: 20, remainingTurns: 3 });
  lista = combatBuffService.aplicarBuff(lista, { atributo: "DANO_SAIDA_PCT", valor: 30, remainingTurns: 2 });
  assert.equal(combatBuffService.somaDeAtributo(lista, "DANO_SAIDA_PCT"), 50);
  assert.equal(combatBuffService.modificadorDeDanoSaida(lista), 1.5);

  const depoisDeUmTurno = combatBuffService.decrementarDuracoes(lista);
  assert.equal(depoisDeUmTurno.length, 2, "nenhum expira ainda (3->2 e 2->1)");
  assert.equal(combatBuffService.somaDeAtributo(depoisDeUmTurno, "DANO_SAIDA_PCT"), 50);

  const depoisDeDoisTurnos = combatBuffService.decrementarDuracoes(depoisDeUmTurno);
  assert.equal(depoisDeDoisTurnos.length, 1, "o buff que tinha duração 2 já expirou (2->1->0)");
  assert.equal(combatBuffService.somaDeAtributo(depoisDeDoisTurnos, "DANO_SAIDA_PCT"), 20);
});

test("bonusDeDefesa soma só os buffs DEFESA_FLAT, nunca mistura com DANO_SAIDA_PCT", () => {
  const lista = [
    { atributo: "DANO_SAIDA_PCT", valor: 100, remainingTurns: 3 },
    { atributo: "DEFESA_FLAT", valor: 40, remainingTurns: 3 },
  ];
  assert.equal(combatBuffService.bonusDeDefesa(lista), 40);
  assert.equal(combatBuffService.modificadorDeDanoSaida(lista), 2);
});

// ---------------------------------------------------------------------
// consumableEffectRegistry — handler APPLY_COMBAT_BUFF
// ---------------------------------------------------------------------

test("APPLY_COMBAT_BUFF (registry) cria a instância com a duração da coluna duration_turns", () => {
  const resultado = executarEfeito("APPLY_COMBAT_BUFF", {
    combatBuffs: [],
    config: { atributo: "DEFESA_FLAT" },
    magnitude: 25,
    duration_turns: 3,
    sourceItemId: 42,
  });
  assert.equal(resultado.combatBuffs.length, 1);
  assert.deepEqual(resultado.combatBuffs[0], {
    atributo: "DEFESA_FLAT",
    valor: 25,
    remainingTurns: 3,
    sourceItemId: 42,
  });
  assert.equal(resultado.aplicado, true);
});

// ---------------------------------------------------------------------
// duelEngine.aplicarAcao — item aplicando o buff (puro, sem RNG: o
// branch de item nunca rola acerto/crítico)
// ---------------------------------------------------------------------

test("aplicarAcao: item com APPLY_COMBAT_BUFF devolve novosBuffsAtacante sem mexer em dano/cura", () => {
  const atacante = personagemBase();
  const defensor = personagemBase();
  const resultado = aplicarAcao({
    atacante,
    defensor,
    acao: {
      tipo: "item",
      item: { id: 7, nome: "Elixir de Fúria" },
      efeito: { efeito_vida: 0, efeito_mana: 0 },
      efeitosConsumiveisModernos: [
        { effect_key: "APPLY_COMBAT_BUFF", magnitude: 50, config: { atributo: "DANO_SAIDA_PCT" }, duration_turns: 2 },
      ],
    },
    vidaMaxAtacante: 200,
    manaMaxAtacante: 100,
    buffsAtacante: [],
  });

  assert.equal(resultado.dano, 0);
  assert.equal(resultado.cura, 0);
  assert.equal(resultado.novosBuffsAtacante.length, 1);
  assert.deepEqual(resultado.novosBuffsAtacante[0], {
    atributo: "DANO_SAIDA_PCT",
    valor: 50,
    remainingTurns: 2,
    sourceItemId: 7,
  });
});

// ---------------------------------------------------------------------
// duelEngine.aplicarAcao — DANO_SAIDA_PCT/DEFESA_FLAT no cálculo de
// dano de um ataque básico de verdade (Math.random fixo pra garantir
// acerto sem crítico e isolar só o efeito do buff)
// ---------------------------------------------------------------------

test("aplicarAcao: multiplicadorDano (onde o DANO_SAIDA_PCT entra, resolvido por quem chama) aumenta o dano do ataque básico na proporção exata", async () => {
  // aplicarAcao nunca lê buffsAtacante pra multiplicar dano — isso é
  // responsabilidade de resolverTurnoComStatus (que soma
  // combatBuffService.modificadorDeDanoSaida ao multiplicadorDano antes
  // de chamar aplicarAcao, igual já faz com Enfraquecimento). Este teste
  // cobre o contrato de aplicarAcao em si; o fio completo (buffsAtacante
  // -> multiplicadorDano) é coberto pelos testes de resolverTurnoComStatus
  // abaixo.
  const atacante = personagemBase();
  const defensor = personagemBase();

  const semBuff = await comMathRandomFixo(0.99, () =>
    aplicarAcao({ atacante: { ...atacante }, defensor: { ...defensor }, acao: { tipo: "attack" }, multiplicadorDano: 1 }),
  );
  const comBuff = await comMathRandomFixo(0.99, () =>
    aplicarAcao({
      atacante: { ...atacante },
      defensor: { ...defensor },
      acao: { tipo: "attack" },
      multiplicadorDano: combatBuffService.modificadorDeDanoSaida([
        { atributo: "DANO_SAIDA_PCT", valor: 50, remainingTurns: 2 },
      ]),
    }),
  );

  assert.ok(semBuff.dano > 0);
  assert.equal(comBuff.dano, Math.round(semBuff.dano * 1.5));
});

test("aplicarAcao: DEFESA_FLAT do defensor reduz o dano recebido do ataque básico", async () => {
  const atacante = personagemBase();
  const defensorSemBuff = personagemBase({ defesa: 0 });
  const defensorComBuff = personagemBase({ defesa: 0 });

  const semBuff = await comMathRandomFixo(0.99, () =>
    aplicarAcao({ atacante: { ...atacante }, defensor: defensorSemBuff, acao: { tipo: "attack" }, buffsDefensor: [] }),
  );
  const comBuff = await comMathRandomFixo(0.99, () =>
    aplicarAcao({
      atacante: { ...atacante },
      defensor: defensorComBuff,
      acao: { tipo: "attack" },
      buffsDefensor: [{ atributo: "DEFESA_FLAT", valor: 50, remainingTurns: 2 }],
    }),
  );

  assert.ok(comBuff.dano < semBuff.dano, "Defesa bonificada precisa mitigar mais dano que sem buff nenhum");
  // aplicarMitigacaoDeDefesa nunca altera o atributo real do defensor —
  // só um objeto efêmero é usado na mitigação.
  assert.equal(defensorComBuff.defesa, 0);
});

// ---------------------------------------------------------------------
// duelEngine.resolverTurnoComStatus — fio completo (buffsAtacante soma
// com Enfraquecimento no multiplicadorDano, buff decrementa a cada
// turno e expira sozinho)
// ---------------------------------------------------------------------

test("resolverTurnoComStatus: buff decrementa 1 por turno e some quando a duração acaba", async () => {
  const atacante = personagemBase();
  const defensor = personagemBase({ vida_atual: 1000 });

  const turno1 = await comMathRandomFixo(0.99, () =>
    resolverTurnoComStatus({
      atacante,
      defensor,
      acao: { tipo: "attack" },
      statusAtacante: [],
      statusDefensor: [],
      buffsAtacante: [{ atributo: "DANO_SAIDA_PCT", valor: 50, remainingTurns: 2 }],
      buffsDefensor: [],
      turno: 1,
      casterActorId: "A",
      nomeAtacante: "Atacante",
      nomeDefensor: "Defensor",
    }),
  );
  assert.equal(turno1.buffsAtacante.length, 1);
  assert.equal(turno1.buffsAtacante[0].remainingTurns, 1, "decrementa 2 -> 1 no fim do próprio turno de quem carrega");

  const turno2 = await comMathRandomFixo(0.99, () =>
    resolverTurnoComStatus({
      atacante,
      defensor,
      acao: { tipo: "attack" },
      statusAtacante: [],
      statusDefensor: [],
      buffsAtacante: turno1.buffsAtacante,
      buffsDefensor: [],
      turno: 2,
      casterActorId: "A",
      nomeAtacante: "Atacante",
      nomeDefensor: "Defensor",
    }),
  );
  assert.equal(turno2.buffsAtacante.length, 0, "o buff ainda valeu pro turno 2 (dano maior) mas expira no fim dele");

  const turnoSemBuffAlgumaVez = await comMathRandomFixo(0.99, () =>
    resolverTurnoComStatus({
      atacante: personagemBase(),
      defensor: personagemBase({ vida_atual: 1000 }),
      acao: { tipo: "attack" },
      statusAtacante: [],
      statusDefensor: [],
      buffsAtacante: [],
      buffsDefensor: [],
      turno: 1,
      casterActorId: "A",
      nomeAtacante: "Atacante",
      nomeDefensor: "Defensor",
    }),
  );
  assert.equal(turno2.dano, Math.round(turnoSemBuffAlgumaVez.dano * 1.5), "turno 2 ainda se beneficia do buff (só expira DEPOIS dele)");
});

// ---------------------------------------------------------------------
// combatController.js — ação de item em combate PvE solo, ciclo de
// vida completo do buff (aplica -> ainda vale no turno seguinte ->
// expira sozinho). Math.random fixo (mesmo valor sempre) garante
// acerto sem crítico e variação de dano determinística, então todo
// número aqui é exato, nunca um intervalo.
// ---------------------------------------------------------------------

async function criarItemConsumivel(nome) {
  const item = await Item.create({
    nome: `${nome} ${sufixo()}`,
    descricao: "Item de teste de buff de combate.",
    tipo_item: "Consumivel",
    raridade: "Comum",
  });
  itensCriados.push(item.id);
  await ConsumableProperties.create({ id_item: item.id, efeito_vida: 0, efeito_mana: 0 });
  return item;
}

async function chamarExecutarTurno(characterId, action) {
  let statusCode = null;
  let corpo = null;
  const req = { personagemAtual: { id: characterId }, body: { action } };
  const res = {
    status(codigo) {
      statusCode = codigo;
      return this;
    },
    json(payload) {
      corpo = payload;
      return this;
    },
  };
  await combatController.executarTurno(req, res);
  return { statusCode, corpo };
}

function statsPersonagemPadrao(personagem) {
  return {
    nivel: personagem.nivel,
    forca: personagem.forca,
    vitalidade: personagem.vitalidade,
    agilidade: personagem.agilidade,
    inteligencia: personagem.inteligencia,
    velocidade: personagem.velocidade,
    defesa: 0,
    arma_equipada: null,
    armaEquipadaEfeitos: [],
    multiplicador_vida_por_nivel: 1,
    multiplicador_mana_por_nivel: 1,
    multiplicador_dano_fisico: 1,
    multiplicador_dano_magico: 1,
  };
}

async function encontroDeTreino(personagem, overrides = {}) {
  personagem.encontro_pve = {
    nome: "Boneco de Treino",
    nivel: 1,
    forca: 1,
    vitalidade: 1,
    agilidade: 0,
    velocidade: 1,
    vida_maxima: 1000,
    vida_atual: 1000,
    dano_base: 0,
    defesa: 0,
    criadoEm: Date.now(),
    statsPersonagem: statsPersonagemPadrao(personagem),
    statusEffects: { player: [], enemy: [] },
    combatBuffs: { player: [], enemy: [] },
    cooldowns: { player: {}, enemy: {} },
    combatTurn: 0,
    ...overrides,
  };
  personagem.vida_atual = 200;
  personagem.mana_atual = 100;
  await personagem.save();
}

testeComBanco(
  "combate PvE: item com APPLY_COMBAT_BUFF (DANO_SAIDA_PCT) aumenta o próximo ataque e expira sozinho",
  async () => {
    const { personagem } = await criarPersonagem({ nivel: 5 });
    const item = await criarItemConsumivel("Elixir de Fúria");
    await ConsumableEffect.create({
      id_item: item.id,
      effect_key: "APPLY_COMBAT_BUFF",
      magnitude: 50,
      duration_turns: 2,
      config: { atributo: "DANO_SAIDA_PCT" },
      ativo: true,
    });
    await CharacterInventory.create({ id_personagem: personagem.id, id_item: item.id, quantidade: 1 });
    await encontroDeTreino(personagem);

    const original = Math.random;
    Math.random = () => 0.99; // garante acerto sem crítico (teto real é 35%/40%)
    try {
      const turno1 = await chamarExecutarTurno(personagem.id, { type: "item", itemId: item.id });
      assert.equal(turno1.statusCode, 200);
      assert.equal(turno1.corpo.data.combatBuffs.player.length, 1);
      assert.equal(turno1.corpo.data.combatBuffs.player[0].remainingTurns, 1, "decrementa no mesmo turno em que foi aplicado");

      // forca=10, nivel=5: base = 4 + 10*0.9 + (5-1)*0.6 = 15.4;
      // variacao(Math.random=0.99) = 0.85 + 0.99*0.3 = 1.147; sem crítico.
      // dano_base = round(15.4 * 1.147) = 18. Com buff de 50%: round(18*1.5) = 27.
      const turno2 = await chamarExecutarTurno(personagem.id, { type: "attack" });
      assert.equal(turno2.statusCode, 200);
      assert.equal(turno2.corpo.data.danoCausadoNoInimigo, 27, "18 de base x 1.5 do buff");
      assert.equal(turno2.corpo.data.combatBuffs.player.length, 0, "expirou no fim deste turno (1 -> 0)");

      const turno3 = await chamarExecutarTurno(personagem.id, { type: "attack" });
      assert.equal(turno3.statusCode, 200);
      assert.equal(turno3.corpo.data.danoCausadoNoInimigo, 18, "buff já tinha expirado — volta ao dano base");
    } finally {
      Math.random = original;
    }
  },
);

testeComBanco("combate PvE: item com APPLY_COMBAT_BUFF (DEFESA_FLAT) reduz o dano do contra-ataque", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const item = await criarItemConsumivel("Escudo Improvisado");
  await ConsumableEffect.create({
    id_item: item.id,
    effect_key: "APPLY_COMBAT_BUFF",
    magnitude: 50,
    duration_turns: 2,
    config: { atributo: "DEFESA_FLAT" },
    ativo: true,
  });
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: item.id, quantidade: 1 });
  // dano_min/dano_max fixos (sem RNG de intervalo — crypto.randomInt(100,101)
  // só tem um valor possível) pra mitigação por Defesa ficar 100% exata.
  await encontroDeTreino(personagem, { dano_min: 100, dano_max: 100 });

  const original = Math.random;
  Math.random = () => 0.99;
  try {
    // reducao = 50/(50+50) = 0.5 -> 100 de dano bruto vira 50.
    const turno1 = await chamarExecutarTurno(personagem.id, { type: "item", itemId: item.id });
    assert.equal(turno1.statusCode, 200);
    assert.equal(turno1.corpo.data.danoRecebidoContraAtaque, 50, "o buff já protege o contra-ataque deste mesmo turno");

    const turno2 = await chamarExecutarTurno(personagem.id, { type: "attack" });
    assert.equal(turno2.corpo.data.danoRecebidoContraAtaque, 50, "buff ainda ativo (remainingTurns 1 -> 0 só no fim deste turno)");

    const turno3 = await chamarExecutarTurno(personagem.id, { type: "attack" });
    assert.equal(turno3.corpo.data.danoRecebidoContraAtaque, 100, "buff expirado — sem Defesa, sem mitigação nenhuma");
  } finally {
    Math.random = original;
  }
});
