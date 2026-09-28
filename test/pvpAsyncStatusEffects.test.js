// Bug real encontrado numa revisão pedida pelo jogador ("revisar e
// testar todos os status effects e ver se estão sendo aplicados
// corretamente"): o duelo PvP ASSÍNCRONO (pvpController.simularDuelo,
// usado por POST /pvp/challenge) era o ÚNICO modo de combate do jogo
// que nunca passava pelo Motor de Status — chamava duelEngine.aplicarAcao
// puro, sem statusEffectService nenhum. Um Power ou arma configurados
// com Queimadura/Silêncio/Congelamento/etc. funcionavam normalmente no
// PvE, no PvP ao vivo e no World Boss, mas eram completamente
// ignorados aqui. Corrigido trocando pra duelEngine.resolverTurnoComStatus
// (mesma função que os outros 3 modos já usavam).
//
// simularDuelo não precisa de Character/Class no banco — só recebe
// objetos "efetivos" já prontos (mesmo formato que personagemComBonus/
// comMultiplicadoresDeClasse produzem). Só o Power/PowerStatusEffect
// (resolvido via PowerStatusEffect.findAll dentro de
// combatEffectResolver.js) precisa ser real no banco.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo } = require("./helpers/db");
const pvpController = require("../src/controllers/pvpController");
const Power = require("../src/models/Power");
const PowerStatusEffect = require("../src/models/PowerStatusEffect");

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

function personagemBase(overrides = {}) {
  return {
    id: 1,
    nome: "Fixture",
    genero: "Masculino",
    nivel: 10,
    forca: 10,
    vitalidade: 10,
    inteligencia: 10,
    agilidade: 5,
    velocidade: 10,
    defesa: 0,
    multiplicador_dano_fisico: 1,
    multiplicador_dano_magico: 1,
    multiplicador_vida_por_nivel: 1,
    multiplicador_mana_por_nivel: 1,
    arma_equipada: null,
    ...overrides,
  };
}

testeComBanco("duelo assíncrono aplica Queimadura (DoT) configurada num Power — bug real: nunca aplicava nada", async () => {
  const power = await Power.create({
    nome: `Chama Assíncrona ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    custo_mana: 0,
    dano_base: 5,
    escala_atributo: "Forca",
    valor_escala: 0,
    cooldown: 0,
  });
  await PowerStatusEffect.create({
    id_power: power.id,
    status_key: "BURN",
    chance_ppm: 1_000_000,
    duration_turns: 3,
    potency_base: 8,
    potency_scale_value: 0,
    target: "Enemy",
  });

  // Desafiante sempre age primeiro (velocidade alta) e SÓ tem esse
  // Power disponível — escolherAcao vai escolhê-lo sempre que puder
  // pagar (custo_mana:0, então sempre). Desafiado com vitalidade alta
  // pra não morrer rápido e dar tempo do tick de Queimadura aparecer
  // no log antes do duelo acabar.
  const desafiante = personagemBase({ id: 1, nome: "Desafiante", velocidade: 999 });
  const desafiado = personagemBase({ id: 2, nome: "Desafiado", vitalidade: 300, agilidade: 0 });

  const resultado = await pvpController.simularDuelo({
    desafiante,
    desafiado,
    poderesDesafiante: [{ ...power.get({ plain: true }), nivel_habilidade: 1 }],
    poderesDesafiado: [],
  });

  assert.ok(
    resultado.log.some((l) => l.includes("Queimadura")),
    `esperava a Queimadura aparecer no log (aplicação e/ou tick) — log completo: ${JSON.stringify(resultado.log, null, 2)}`,
  );
  assert.ok(
    resultado.log.some((l) => l.includes("sofreu") && l.includes("Queimadura")),
    "esperava pelo menos um tick de dano de Queimadura no log",
  );
});

testeComBanco("duelo assíncrono aplica Silêncio e bloqueia Power do alvo — bug real: nenhum controle funcionava", async () => {
  const powerSilenciador = await Power.create({
    nome: `Grito Silenciador ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    custo_mana: 0,
    dano_base: 1,
    escala_atributo: "Forca",
    valor_escala: 0,
    cooldown: 0,
  });
  await PowerStatusEffect.create({
    id_power: powerSilenciador.id,
    status_key: "SILENCE",
    chance_ppm: 1_000_000,
    duration_turns: 5,
    potency_base: 0,
    potency_scale_value: 0,
    target: "Enemy",
  });

  const powerDoAlvo = await Power.create({
    nome: `Poder do Alvo ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    custo_mana: 0,
    dano_base: 5,
    escala_atributo: "Forca",
    valor_escala: 0,
    cooldown: 0,
  });

  // Desafiante sempre primeiro, silencia no 1º golpe. Desafiado só tem
  // esse Power disponível (sem ataque básico competindo) — assim, se o
  // Motor de Status estiver funcionando, o 2º turno do desafiado vira
  // "Ação bloqueada" em vez de usar o Power normalmente.
  const desafiante = personagemBase({ id: 1, nome: "Desafiante", velocidade: 999 });
  const desafiado = personagemBase({ id: 2, nome: "Desafiado", vitalidade: 300, agilidade: 0 });

  const resultado = await pvpController.simularDuelo({
    desafiante,
    desafiado,
    poderesDesafiante: [{ ...powerSilenciador.get({ plain: true }), nivel_habilidade: 1 }],
    poderesDesafiado: [{ ...powerDoAlvo.get({ plain: true }), nivel_habilidade: 1 }],
  });

  assert.ok(
    resultado.log.some((l) => l.includes("Silêncio")),
    `esperava o Silêncio aparecer no log — log completo: ${JSON.stringify(resultado.log, null, 2)}`,
  );
  assert.ok(
    resultado.turnos.some((t) => t.atacante === "B" && t.nomeAcao === "Ação bloqueada"),
    `esperava pelo menos um turno do Desafiado bloqueado — turnos: ${JSON.stringify(resultado.turnos, null, 2)}`,
  );
});
