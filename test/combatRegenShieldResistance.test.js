// Alquimia/Caldeirão V2 (spec §13) — REGEN_HP/REGEN_MANA, GRANT_SHIELD e
// STATUS_RESISTANCE. Mesma estrutura de test/combatBuff.test.js: service
// isolado primeiro, depois os 2 pontos de integração reais (PvE solo via
// combatController.js, PvP/Grupo via duelEngine.js).
const test = require("node:test");
const assert = require("node:assert/strict");

// test/helpers/db SEMPRE primeiro — ver comentário em combatBuff.test.js
// (duelEngine.js carrega um model do Sequelize por baixo dos panos).
const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");
const combatBuffService = require("../src/services/combatBuffService");
const { executarEfeito } = require("../src/services/consumableEffectRegistry");
const { aplicarAcao, resolverTurnoComStatus } = require("../src/services/duelEngine");
const Item = require("../src/models/Item");
const ConsumableProperties = require("../src/models/ConsumableProperties");
const ConsumableEffect = require("../src/models/ConsumableEffect");
const CharacterInventory = require("../src/models/CharacterInventory");
const Power = require("../src/models/Power");
const PowerCombatEffect = require("../src/models/PowerCombatEffect");
const CharacterAbilities = require("../src/models/CharacterAbilities");
const PowerStatusEffect = require("../src/models/PowerStatusEffect");
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
const powersCriados = [];
test.after(async () => {
  if (!temBanco) return;
  if (itensCriados.length > 0) {
    await ConsumableEffect.destroy({ where: { id_item: itensCriados } });
    await ConsumableProperties.destroy({ where: { id_item: itensCriados } });
    await Item.destroy({ where: { id: itensCriados } });
  }
  if (powersCriados.length > 0) {
    await PowerCombatEffect.destroy({ where: { id_power: powersCriados } });
    await CharacterAbilities.destroy({ where: { id_power: powersCriados } });
    await PowerStatusEffect.destroy({ where: { id_power: powersCriados } });
    await Power.destroy({ where: { id: powersCriados } });
  }
  await sequelize.close();
});

// Cuidado: `fn` pode ser assíncrona (resolverTurnoComStatus) e dar um
// `await` ANTES das rolagens de dado que este helper existe pra fixar
// (ex.: `await resolverEfeitosDoUso` pra Power, antes do acerto/crítico)
// — restaurar Math.random num `finally` síncrono destravaria o mock
// cedo demais, antes da Promise resolver de verdade. Sempre aguarda o
// resultado (via Promise.resolve, funciona pra síncrono também) antes
// de restaurar.
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
// combatBuffService (puro) — regen, resistência, escudo
// ---------------------------------------------------------------------

test("regenDeVidaDoTurno soma FLAT + PERCENT do máximo efetivo", () => {
  const lista = [
    { atributo: "REGEN_HP_FLAT", valor: 5, remainingTurns: 2 },
    { atributo: "REGEN_HP_PERCENT", valor: 10, remainingTurns: 2 },
  ];
  assert.equal(combatBuffService.regenDeVidaDoTurno(lista, 100), 15);
});

test("regenDeManaDoTurno espelha regenDeVidaDoTurno", () => {
  const lista = [{ atributo: "REGEN_MANA_FLAT", valor: 8, remainingTurns: 1 }];
  assert.equal(combatBuffService.regenDeManaDoTurno(lista, 50), 8);
});

test("resolverTentativaDeStatus: sem resistência configurada nunca resiste (e não rola RNG)", () => {
  const originalRandom = Math.random;
  let chamadas = 0;
  Math.random = () => {
    chamadas += 1;
    return 0;
  };
  try {
    const resultado = combatBuffService.resolverTentativaDeStatus([]);
    assert.equal(resultado.resistiu, false);
    assert.equal(chamadas, 0, "nunca deveria gastar uma rolagem à toa pra quem não tem resistência");
  } finally {
    Math.random = originalRandom;
  }
});

test("resolverTentativaDeStatus: respeita o teto global mesmo empilhando acima dele", async () => {
  const lista = [
    { atributo: "STATUS_RESISTANCE_PCT", valor: 60, remainingTurns: 3 },
    { atributo: "STATUS_RESISTANCE_PCT", valor: 60, remainingTurns: 3 },
  ];
  // soma bruta seria 120%, mas o teto é 75% (STATUS_RESISTANCE_MAXIMA)
  const comRandomLogoAbaixoDoTeto = await comMathRandomFixo(0.749, () => combatBuffService.resolverTentativaDeStatus(lista));
  assert.equal(comRandomLogoAbaixoDoTeto.resistiu, true, "74.9% < 75% deveria resistir");

  const comRandomAcimaDoTeto = await comMathRandomFixo(0.751, () => combatBuffService.resolverTentativaDeStatus(lista));
  assert.equal(comRandomAcimaDoTeto.resistiu, false, "75.1% > teto de 75% nunca deveria resistir, por mais que empilhe");
});

test("concederEscudo: o MAIOR valor sempre prevalece, nunca soma dois escudos", () => {
  const primeiro = combatBuffService.concederEscudo(null, 30, 2);
  assert.deepEqual(primeiro, { valor: 30, remainingTurns: 2 });

  const substituidoPorMaior = combatBuffService.concederEscudo(primeiro, 50, 3);
  assert.deepEqual(substituidoPorMaior, { valor: 50, remainingTurns: 3 });

  const ignoradoPorMenor = combatBuffService.concederEscudo(substituidoPorMaior, 10, 5);
  assert.deepEqual(ignoradoPorMenor, substituidoPorMaior, "escudo menor não substitui o maior já ativo");
});

test("concederEscudo rejeita valor ou duração <= 0", () => {
  assert.throws(() => combatBuffService.concederEscudo(null, 0, 2));
  assert.throws(() => combatBuffService.concederEscudo(null, 10, 0));
});

test("absorverDano: absorve parcialmente, esgota pra null quando o dano excede o escudo, e nunca mexe em Defesa", () => {
  const escudo = { valor: 30, remainingTurns: 2 };
  const parcial = combatBuffService.absorverDano(escudo, 10);
  assert.deepEqual(parcial.escudo, { valor: 20, remainingTurns: 2 });
  assert.equal(parcial.danoResidual, 0);

  const estourando = combatBuffService.absorverDano(parcial.escudo, 50);
  assert.equal(estourando.escudo, null, "escudo esgotado vira null, nunca fica negativo");
  assert.equal(estourando.danoResidual, 30, "só o excedente (50 - 20) passa pra Vida");
});

test("absorverDano sem escudo nenhum deixa o dano passar inteiro", () => {
  const resultado = combatBuffService.absorverDano(null, 42);
  assert.equal(resultado.escudo, null);
  assert.equal(resultado.danoResidual, 42);
});

test("decrementarDuracaoDoEscudo remove quando a duração chega a 0", () => {
  const escudo = { valor: 10, remainingTurns: 1 };
  assert.equal(combatBuffService.decrementarDuracaoDoEscudo(escudo), null);
  assert.deepEqual(combatBuffService.decrementarDuracaoDoEscudo({ valor: 10, remainingTurns: 2 }), {
    valor: 10,
    remainingTurns: 1,
  });
  assert.equal(combatBuffService.decrementarDuracaoDoEscudo(null), null);
});

// ---------------------------------------------------------------------
// consumableEffectRegistry — handler GRANT_SHIELD
// ---------------------------------------------------------------------

test("GRANT_SHIELD (registry) cria o escudo e respeita 'o maior prevalece' numa segunda aplicação", () => {
  const primeiro = executarEfeito("GRANT_SHIELD", { escudoAtual: null, magnitude: 30, duration_turns: 2 });
  assert.deepEqual(primeiro.escudo, { valor: 30, remainingTurns: 2 });

  const segundoMenor = executarEfeito("GRANT_SHIELD", { escudoAtual: primeiro.escudo, magnitude: 10, duration_turns: 5 });
  assert.deepEqual(segundoMenor.escudo, primeiro.escudo, "escudo menor não substitui o maior já ativo");
});

// ---------------------------------------------------------------------
// duelEngine.aplicarAcao/resolverTurnoComStatus — puro
// ---------------------------------------------------------------------

test("aplicarAcao: item com GRANT_SHIELD devolve novoEscudoAtacante", () => {
  const atacante = personagemBase();
  const defensor = personagemBase();
  const resultado = aplicarAcao({
    atacante,
    defensor,
    acao: {
      tipo: "item",
      item: { nome: "Totem de Proteção" },
      efeito: {},
      efeitosConsumiveisModernos: [{ effect_key: "GRANT_SHIELD", magnitude: 40, duration_turns: 3 }],
    },
    escudoAtacante: null,
  });
  assert.deepEqual(resultado.novoEscudoAtacante, { valor: 40, remainingTurns: 3 });
});

test("aplicarAcao: escudo do defensor absorve o dano do ataque antes da Vida", async () => {
  const atacante = personagemBase();
  const defensor = personagemBase({ vida_atual: 100 });
  const resultado = await comMathRandomFixo(0.99, () =>
    aplicarAcao({
      atacante,
      defensor,
      acao: { tipo: "attack" },
      escudoDefensor: { valor: 10, remainingTurns: 2 },
    }),
  );
  assert.ok(resultado.dano > 10, "o dano bruto precisa ser maior que o escudo pra este teste fazer sentido");
  assert.equal(defensor.vida_atual, 100 - (resultado.dano - 10), "só o excedente do escudo desconta da Vida real");
  assert.equal(resultado.novoEscudoDefensor, null, "escudo de 10 não aguenta um ataque básico nível 5, esgota");
});

test("resolverTurnoComStatus: REGEN_HP cura no fim do turno do atacante, antes do buff decrementar", async () => {
  const atacante = personagemBase({ vida_atual: 50 });
  const defensor = personagemBase({ vida_atual: 1000 });
  const resultado = await comMathRandomFixo(0.99, () =>
    resolverTurnoComStatus({
      atacante,
      defensor,
      acao: { tipo: "attack" },
      statusAtacante: [],
      statusDefensor: [],
      buffsAtacante: [{ atributo: "REGEN_HP_FLAT", valor: 20, remainingTurns: 2 }],
      buffsDefensor: [],
      turno: 1,
      casterActorId: "A",
      nomeAtacante: "Atacante",
      nomeDefensor: "Defensor",
    }),
  );
  assert.equal(atacante.vida_atual, 70, "50 de vida + 20 de regen, mesmo turno em que a ação aconteceu");
  assert.equal(resultado.buffsAtacante[0].remainingTurns, 1, "regen tica e DEPOIS decrementa");
});

testeComBanco(
  "resolverTurnoComStatus: STATUS_RESISTANCE do defensor nega um status hostil configurado na Power (fim a fim, via banco)",
  async () => {
    const power = await Power.create({
      nome: `Flecha Envenenada ${sufixo()}`,
      descricao: "teste",
      tipo_poder: "Ativo",
      custo_mana: 0,
      dano_base: 10,
      escala_atributo: "Forca",
      valor_escala: 1,
      cooldown: 0,
    });
    powersCriados.push(power.id);
    await PowerStatusEffect.create({
      id_power: power.id,
      status_key: "POISON",
      chance_ppm: 1_000_000, // 100% — nunca falha por chance própria, só por resistência
      duration_turns: 3,
      potency_base: 5,
      target: "Enemy",
    });

    const atacante = personagemBase();
    const defensorResistente = personagemBase({ vida_atual: 1000 });
    const defensorSemResistencia = personagemBase({ vida_atual: 1000 });

    // Math.random = 0.5 satisfaz os 3 sorteios ao mesmo tempo:
    // acerto garantido (>= qualquer chance de esquiva, teto real 35%),
    // sem crítico (>= qualquer chance de crítico, teto real 40%), e
    // resistência de 75% ativa (50 < 75 → resiste).
    const comResistencia = await comMathRandomFixo(0.5, () =>
      resolverTurnoComStatus({
        atacante: { ...atacante },
        defensor: defensorResistente,
        acao: { tipo: "power", power },
        statusAtacante: [],
        statusDefensor: [],
        buffsAtacante: [],
        buffsDefensor: [{ atributo: "STATUS_RESISTANCE_PCT", valor: 75, remainingTurns: 3 }],
        turno: 1,
        casterActorId: "A",
        nomeAtacante: "Atacante",
        nomeDefensor: "Defensor",
      }),
    );
    assert.equal(comResistencia.statusDefensor.length, 0, "resistiu — nunca deveria pegar POISON");
    assert.ok(comResistencia.log.some((l) => l.includes("resistiu")));

    const semResistencia = await comMathRandomFixo(0.5, () =>
      resolverTurnoComStatus({
        atacante: { ...atacante },
        defensor: defensorSemResistencia,
        acao: { tipo: "power", power },
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
    assert.equal(semResistencia.statusDefensor.length, 1, "sem resistência nenhuma, o POISON de 100% de chance sempre pega");
    assert.equal(semResistencia.statusDefensor[0].key, "POISON");
  },
);

// ---------------------------------------------------------------------
// combatController.js — ação de item em combate PvE solo (mesmos
// helpers de test/combatBuff.test.js e test/consumableHealMana.test.js)
// ---------------------------------------------------------------------

async function criarItemConsumivel(nome) {
  const item = await Item.create({
    nome: `${nome} ${sufixo()}`,
    descricao: "Item de teste de regen/escudo/resistência.",
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
    escudo: { player: null, enemy: null },
    cooldowns: { player: {}, enemy: {} },
    combatTurn: 0,
    ...overrides,
  };
  // vidaMaxima real pra nivel 5/vitalidade 10 é 110 (30 + 10*6 + (5-1)*5)
  // — nunca um valor "redondo" acima disso, senão
  // sincronizarRegeneracaoDeVidaEMana clampa pra baixo ANTES de qualquer
  // cálculo de combate rodar (mesma pegadinha já documentada em
  // test/combatEvolucaoStatusIntegracao.test.js).
  personagem.vida_atual = 100;
  personagem.mana_atual = 86;
  await personagem.save();
}

testeComBanco("combate PvE: item com REGEN_HP_FLAT cura a cada turno até expirar sozinho", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const item = await criarItemConsumivel("Totem de Cura Contínua");
  await ConsumableEffect.create({
    id_item: item.id,
    effect_key: "APPLY_COMBAT_BUFF",
    magnitude: 10,
    duration_turns: 2,
    config: { atributo: "REGEN_HP_FLAT" },
    ativo: true,
  });
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: item.id, quantidade: 1 });
  await encontroDeTreino(personagem);
  // Margem generosa (bem abaixo do teto de 110) pra duas rodadas cheias
  // de regen (+10 cada) e o piso de 1 de dano do contra-ataque nunca
  // baterem no teto e mascararem o valor curado de verdade.
  personagem.vida_atual = 30;
  await personagem.save();

  const original = Math.random;
  Math.random = () => 0.99;
  try {
    const turno1 = await chamarExecutarTurno(personagem.id, { type: "item", itemId: item.id });
    assert.equal(turno1.statusCode, 200);
    assert.ok(turno1.corpo.data.log.some((l) => l.includes("regenerou 10 de vida")), "regen tica no MESMO turno em que o item foi usado");
    assert.equal(turno1.corpo.data.combatBuffs.player[0].remainingTurns, 1);

    const turno2 = await chamarExecutarTurno(personagem.id, { type: "attack" });
    assert.ok(turno2.corpo.data.log.some((l) => l.includes("regenerou 10 de vida")), "ainda tica no turno em que a duração zera");
    assert.equal(turno2.corpo.data.combatBuffs.player.length, 0, "expirou no fim deste turno");

    const turno3 = await chamarExecutarTurno(personagem.id, { type: "attack" });
    assert.ok(!turno3.corpo.data.log.some((l) => l.includes("regenerou")), "buff expirado — não tica mais");
  } finally {
    Math.random = original;
  }
});

testeComBanco("combate PvE: item com GRANT_SHIELD absorve o contra-ataque e esgota corretamente", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const item = await criarItemConsumivel("Totem de Proteção");
  await ConsumableEffect.create({
    id_item: item.id,
    effect_key: "GRANT_SHIELD",
    magnitude: 50,
    duration_turns: 2,
    ativo: true,
  });
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: item.id, quantidade: 1 });
  // dano_min/dano_max fixos em 30 (sem RNG de intervalo) pra conferir a
  // absorção do escudo com números exatos.
  await encontroDeTreino(personagem, { dano_min: 30, dano_max: 30 });

  const original = Math.random;
  Math.random = () => 0.99;
  try {
    const vidaAntes = personagem.vida_atual;
    const turno1 = await chamarExecutarTurno(personagem.id, { type: "item", itemId: item.id });
    assert.equal(turno1.statusCode, 200);
    assert.equal(turno1.corpo.data.danoRecebidoContraAtaque, 30, "dano bruto reportado continua o mesmo, antes da absorção");
    assert.equal(turno1.corpo.data.character.vida_atual, vidaAntes, "escudo de 50 absorve os 30 inteiros — Vida real intacta");
    assert.equal(turno1.corpo.data.escudo.player.valor, 20, "50 - 30 de dano absorvido");

    const turno2 = await chamarExecutarTurno(personagem.id, { type: "attack" });
    assert.equal(turno2.corpo.data.character.vida_atual, vidaAntes - 10, "escudo restante (20) absorve parte, só 10 vaza pra Vida");
    assert.equal(turno2.corpo.data.escudo.player, null, "escudo esgotou");

    const turno3 = await chamarExecutarTurno(personagem.id, { type: "attack" });
    assert.equal(turno3.corpo.data.character.vida_atual, vidaAntes - 10 - 30, "sem escudo nenhum, os 30 passam inteiros");
  } finally {
    Math.random = original;
  }
});

testeComBanco("combate PvE: item com STATUS_RESISTANCE_PCT nega o efeito de status do monstro", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const item = await criarItemConsumivel("Amuleto de Resistência");
  await ConsumableEffect.create({
    id_item: item.id,
    effect_key: "APPLY_COMBAT_BUFF",
    magnitude: 75,
    duration_turns: 3,
    config: { atributo: "STATUS_RESISTANCE_PCT" },
    ativo: true,
  });
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: item.id, quantidade: 1 });
  await encontroDeTreino(personagem, {
    dano_min: 5,
    dano_max: 5,
    efeitosDeStatus: [{ status_key: "POISON", chance_ppm: 1_000_000, duration_turns: 3, potency_base: 5, ativo: true }],
  });

  const original = Math.random;
  // 0.5 garante acerto sem crítico (tetos reais 35%/40%) E, ao mesmo
  // tempo, a resolução de resistência (50 < 75 -> resiste).
  Math.random = () => 0.5;
  try {
    await chamarExecutarTurno(personagem.id, { type: "item", itemId: item.id });
    const turno2 = await chamarExecutarTurno(personagem.id, { type: "attack" });
    assert.equal(turno2.statusCode, 200);
    assert.ok(turno2.corpo.data.log.some((l) => l.includes("resistiu")), "deveria ter resistido ao POISON do monstro");
    assert.equal(turno2.corpo.data.statusEffects.player.length, 0, "nunca deveria ter pego o status");
  } finally {
    Math.random = original;
  }
});


testeComBanco("PvE: COMBAT_START uma vez, TURN_START/TURN_END no passe e ON_DAMAGE_TAKEN no contra-ataque", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const power = await Power.create({ nome: `Eventos_${sufixo()}`, descricao: "Teste de eventos", tipo_poder: "Passivo", custo_mana: 0,
    escala_atributo: "Forca", valor_escala: 0 });
  powersCriados.push(power.id);
  await CharacterAbilities.create({ id_personagem: personagem.id, id_power: power.id });
  for (const [trigger, magnitude_base] of [["COMBAT_START", 10], ["TURN_START", 2], ["TURN_END", 3], ["ON_DAMAGE_TAKEN", 4]]) {
    await PowerCombatEffect.create({ id_power: power.id, trigger, effect_key: "REGEN_MANA_FLAT", magnitude_base });
  }
  await encontroDeTreino(personagem);
  personagem.mana_atual = 10;
  personagem.ultima_atualizacao_mana = new Date();
  await personagem.save();
  await comMathRandomFixo(0.99, async () => {
    const first = await chamarExecutarTurno(personagem.id, { type: "pass" });
    assert.equal(first.statusCode, 200);
    assert.equal(first.corpo.data.character.mana_atual, 29);
    await personagem.reload();
    assert.equal(personagem.encontro_pve.playerPowerCombatState.started, true);
    const second = await chamarExecutarTurno(personagem.id, { type: "pass" });
    assert.equal(second.statusCode, 200);
    assert.equal(second.corpo.data.character.mana_atual, 38);
  });
});

testeComBanco("PvE: ON_CAST temporário expira e ação rejeitada não consome evento", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const power = await Power.create({ nome: `Cast_${sufixo()}`, descricao: "Teste de cast", tipo_poder: "Ativo", custo_mana: 0,
    dano_base: 10, escala_atributo: "Forca", valor_escala: 0 });
  powersCriados.push(power.id);
  await CharacterAbilities.create({ id_personagem: personagem.id, id_power: power.id, is_active: true });
  await PowerCombatEffect.create({ id_power: power.id, trigger: "ON_CAST", effect_key: "DEFENSE_FLAT",
    magnitude_base: 12, duration_turns: 1 });
  await encontroDeTreino(personagem);
  await comMathRandomFixo(0.99, async () => {
    const rejected = await chamarExecutarTurno(personagem.id, { type: "power", powerId: 999999999 });
    assert.equal(rejected.statusCode, 404);
    await personagem.reload();
    assert.equal(personagem.encontro_pve.playerPowerCombatState, undefined);
    const first = await chamarExecutarTurno(personagem.id, { type: "power", powerId: power.id });
    assert.equal(first.statusCode, 200);
    await personagem.reload();
    assert.equal(personagem.encontro_pve.playerPowerCombatState.effects.length, 1);
    const second = await chamarExecutarTurno(personagem.id, { type: "attack" });
    assert.equal(second.statusCode, 200);
    await personagem.reload();
    assert.equal(personagem.encontro_pve.playerPowerCombatState.effects.length, 0);
  });
});
