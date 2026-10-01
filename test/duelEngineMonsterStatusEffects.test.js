// Aventura em Grupo (party) — bug reportado: "monstros poderem causar
// status effect em seus ataques" e "o dano do status deve ser
// contabilizado após o turno de quem está com o status, não na hora do
// ataque de quem vai causar". A party batalhava com duelEngine.aplicarAcao
// puro (sem Motor de Status nenhum) — corrigido trocando pra
// resolverTurnoComStatus, igual o Duelo ao vivo/PvP assíncrono/PvE solo
// já faziam, com um novo parâmetro `efeitosDeStatusAtacante` pra cobrir
// o catálogo configurado no admin (MonsterStatusEffect), já que o
// monstro não tem Power nem arma — só esse novo caminho.
//
// Sem banco: resolverEfeitosDeMonstroNoHit (monsterEffectResolver.js)
// não consulta nada, então isto testa puro, sem precisar de fixture de
// Character/Power.
const test = require("node:test");
const assert = require("node:assert/strict");

const { resolverTurnoComStatus } = require("../src/services/duelEngine");

function monstroBase(overrides = {}) {
  return {
    vida_atual: 100,
    mana_atual: 0,
    forca: 20,
    vitalidade: 10,
    inteligencia: 0,
    agilidade: 2,
    velocidade: 2,
    defesa: 0,
    multiplicador_dano_fisico: 1,
    multiplicador_dano_magico: 1,
    arma_equipada: null,
    ...overrides,
  };
}

function alvoBase(overrides = {}) {
  return {
    vida_atual: 100,
    mana_atual: 50,
    forca: 10,
    vitalidade: 10,
    inteligencia: 10,
    agilidade: 0,
    velocidade: 2,
    defesa: 0,
    multiplicador_dano_fisico: 1,
    multiplicador_dano_magico: 1,
    arma_equipada: null,
    ...overrides,
  };
}

test("monstro com status configurado (chance 100%) aplica a instância no jogador ao acertar, mas NÃO causa dano nessa mesma hora", async () => {
  const monstro = monstroBase();
  const alvo = alvoBase();

  const resultado = await resolverTurnoComStatus({
    atacante: monstro,
    defensor: alvo,
    acao: { tipo: "attack" },
    vidaMaxAtacante: 100,
    statusAtacante: [],
    statusDefensor: [],
    turno: 1,
    casterActorId: "inimigo",
    efeitosDeStatusAtacante: [
      { status_key: "POISON", chance_ppm: 1_000_000, duration_turns: 3, potency_base: 9, ativo: true },
    ],
    nomeAtacante: "Lobo Selvagem",
    nomeDefensor: "Aventureiro",
  });

  assert.ok(resultado.dano > 0, "ataque básico precisa ter causado dano direto pra proc do status disparar");
  assert.equal(resultado.statusDefensor.length, 1);
  assert.equal(resultado.statusDefensor[0].key, "POISON");
  assert.equal(resultado.statusDefensor[0].remainingTurns, 3);

  // A vida do ALVO só caiu pelo dano direto do golpe — o DoT recém
  // aplicado não tirou vida nenhuma nesta mesma resolução (só vai tirar
  // no PRÓPRIO turno do alvo, quando processarTicksDeInicio dele rodar).
  const vidaSoDoGolpeDireto = 100 - resultado.dano;
  assert.equal(alvo.vida_atual, vidaSoDoGolpeDireto);
});

test("status configurado com ativo:false nunca é sorteado, mesmo com chance 100%", async () => {
  const monstro = monstroBase();
  const alvo = alvoBase();

  const resultado = await resolverTurnoComStatus({
    atacante: monstro,
    defensor: alvo,
    acao: { tipo: "attack" },
    vidaMaxAtacante: 100,
    statusAtacante: [],
    statusDefensor: [],
    turno: 1,
    casterActorId: "inimigo",
    efeitosDeStatusAtacante: [
      { status_key: "BURN", chance_ppm: 1_000_000, duration_turns: 2, potency_base: 5, ativo: false },
    ],
    nomeAtacante: "Lobo Selvagem",
    nomeDefensor: "Aventureiro",
  });

  assert.equal(resultado.statusDefensor.length, 0);
});

test("DoT que o PRÓPRIO monstro carrega tica no FIM do turno dele (depois do ataque), nunca na hora de um golpe recebido antes", async () => {
  const monstro = monstroBase({ vida_atual: 50 });
  const alvo = alvoBase();

  // Monstro já entra no turno com Queimadura ativa (ex.: aplicada por um
  // Power do jogador num turno anterior) — o tick tem que acontecer
  // DEPOIS do ataque básico dele, nunca antes.
  const statusAtacanteInicial = [
    { key: "BURN", sourceActorId: "A", remainingTurns: 2, stacks: 1, potency: 12, appliedAtTurn: 0 },
  ];

  const resultado = await resolverTurnoComStatus({
    atacante: monstro,
    defensor: alvo,
    acao: { tipo: "attack" },
    vidaMaxAtacante: 50,
    statusAtacante: statusAtacanteInicial,
    statusDefensor: [],
    turno: 2,
    casterActorId: "inimigo",
    nomeAtacante: "Lobo Selvagem",
    nomeDefensor: "Aventureiro",
  });

  // Vida do monstro caiu exatamente pelos 12 da Queimadura (nenhum outro
  // dano recebido nesta resolução — ele é o atacante, não o defensor).
  assert.equal(monstro.vida_atual, 50 - 12);
  assert.ok(resultado.log.some((linha) => linha.includes("Queimadura")));
  // Duração decrementa só DEPOIS do tick, no fim do próprio turno dele.
  assert.equal(resultado.statusAtacante[0].remainingTurns, 1);
});
