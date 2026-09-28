// Bug real encontrado numa revisão pedida pelo jogador ("revisar e
// testar todos os status effects"): duelEngine.resolverTurnoComStatus
// (usado por PvP ao vivo, World Boss e — desde a correção desta mesma
// revisão — PvP assíncrono) quebrava com TypeError sempre que um Power
// era bloqueado por Silêncio SOZINHO (sem nenhum hard control
// FREEZE/STUN/PARALYZE junto). motivoBloqueioTotal só é setado pelos
// hard controls (statusEffectService.resolverAcoesBloqueadasDoTurno);
// Silêncio bloqueia ACTION_TYPE.POWER sem nunca setar motivo — a linha
// de log fazia `definicaoDoStatus(null).nomeUi`, null.nomeUi = crash.
// A função nunca chega a consultar Power/PowerStatusEffect quando a
// ação é bloqueada (retorna antes) — dá pra testar sem banco nenhum.
const test = require("node:test");
const assert = require("node:assert/strict");
const { resolverTurnoComStatus } = require("../src/services/duelEngine");

function personagem(overrides = {}) {
  return {
    forca: 10,
    vitalidade: 10,
    inteligencia: 10,
    agilidade: 10,
    velocidade: 10,
    vida_atual: 100,
    mana_atual: 100,
    multiplicador_dano_fisico: 1,
    multiplicador_dano_magico: 1,
    ...overrides,
  };
}

const poderQualquer = {
  id: 999,
  nome: "Poder de Teste",
  dano_base: 10,
  valor_escala: 0,
  escala_atributo: "Forca",
  custo_mana: 0,
  cooldown: 0,
};

test("Silêncio sozinho (sem hard control) bloqueia Power sem derrubar o turno com TypeError", async () => {
  const atacante = personagem();
  const defensor = personagem();
  const statusComSilencio = [{ key: "SILENCE", remainingTurns: 3, stacks: 1, potency: 0 }];

  const resultado = await resolverTurnoComStatus({
    atacante,
    defensor,
    acao: { tipo: "power", power: poderQualquer },
    vidaMaxAtacante: 100,
    manaMaxAtacante: 100,
    statusAtacante: statusComSilencio,
    statusDefensor: [],
    turno: 1,
    casterActorId: "A",
    armaEfeitosAtacante: [],
    itemIdArmaAtacante: null,
    nomeAtacante: "Atacante",
    nomeDefensor: "Defensor",
  });

  assert.equal(resultado.bloqueado, true);
  assert.equal(resultado.dano, 0);
  assert.equal(atacante.mana_atual, 100, "tentativa bloqueada não pode gastar mana");
  assert.ok(
    resultado.log.some((l) => l.includes("Silêncio")),
    `log precisa nomear Silêncio como o motivo do bloqueio — log: ${JSON.stringify(resultado.log)}`,
  );
});

test("Silêncio NÃO bloqueia ataque básico (só Power) — resolve normalmente sem crash", async () => {
  const atacante = personagem();
  const defensor = personagem();
  const statusComSilencio = [{ key: "SILENCE", remainingTurns: 3, stacks: 1, potency: 0 }];

  const resultado = await resolverTurnoComStatus({
    atacante,
    defensor,
    acao: { tipo: "attack" },
    vidaMaxAtacante: 100,
    manaMaxAtacante: 100,
    statusAtacante: statusComSilencio,
    statusDefensor: [],
    turno: 1,
    casterActorId: "A",
    armaEfeitosAtacante: [],
    itemIdArmaAtacante: null,
    nomeAtacante: "Atacante",
    nomeDefensor: "Defensor",
  });

  assert.equal(resultado.bloqueado, undefined, "ataque básico nunca é bloqueado por Silêncio");
});

test("Freeze (hard control) continua bloqueando e logando corretamente — sem regressão", async () => {
  const atacante = personagem();
  const defensor = personagem();
  const statusComFreeze = [{ key: "FREEZE", remainingTurns: 2, stacks: 1, potency: 0 }];

  const resultado = await resolverTurnoComStatus({
    atacante,
    defensor,
    acao: { tipo: "attack" },
    vidaMaxAtacante: 100,
    manaMaxAtacante: 100,
    statusAtacante: statusComFreeze,
    statusDefensor: [],
    turno: 1,
    casterActorId: "A",
    armaEfeitosAtacante: [],
    itemIdArmaAtacante: null,
    nomeAtacante: "Atacante",
    nomeDefensor: "Defensor",
  });

  assert.equal(resultado.bloqueado, true);
  assert.ok(resultado.log.some((l) => l.includes("Congelamento")));
});
