const test = require("node:test");
const assert = require("node:assert/strict");
const EVENTS = require("../src/contracts/socketEvents");
const { montarPayloadDuelo, montarPayloadTurno, montarPayloadFim } = require("../src/contracts/pvpPayloads");
const { montarPayloadInicio, montarPayloadRating } = require("../src/contracts/rankedPayloads");
const { montarPayloadBatalha } = require("../src/contracts/partyPayloads");

function fighter(id) {
  return { id, nome: `Herói ${id}`, genero: "Masculino", classe: "Guerreiro", vidaMax: 100, manaMax: 50,
    estado: { vida_atual: 70, mana_atual: 30 }, poderes: [{ id: 9, combat_slot: 4, nome: "Golpe", custo_mana: 5, dano_base: 20, cura_base: 0, nivel_habilidade: 1 }], consumiveis: [] };
}
function duel() {
  return { id: 10, arena: "Arena", torneio: null, a: fighter(1), b: fighter(2), turnoDe: "B", rankedMatchId: 11, seasonId: 3, ratingAntes: { A: 1000, B: 1050 }, ia: "B", statusEffects: { A: [{ key: "BURN", remainingTurns: 2, stacks: 1, sourceActorId: "private" }], B: [] } };
}

test("public event names remain compatible and cannot be mutated", () => {
  assert.equal(EVENTS.PVP.ACAO, "pvp:acao");
  assert.equal(EVENTS.RANKED.RATING_UPDATE, "ranked:rating:update");
  assert.equal(EVENTS.PARTY.BATALHA_ESTADO, "party:batalha-estado");
  assert.equal(Object.isFrozen(EVENTS.PVP), true);
  const names = Object.values(EVENTS).flatMap(Object.values);
  assert.equal(new Set(names).size, names.length);
});

test("start/resync serializes current resources and explicit ability slots", () => {
  const state = duel();
  const initial = montarPayloadDuelo(state);
  assert.equal(initial.poderesA[0].combat_slot, 4);
  assert.equal(initial.poderesA[0].custo_mana, 5);
  assert.equal(initial.prazoSegundos, 5);
  assert.equal(initial.turnoDe, "B");
  state.a.estado.vida_atual = 13;
  assert.equal(montarPayloadDuelo(state).vidaA, 13);
  assert.equal(initial.vidaA, 70);
});

test("ranked retains IA, empty consumables and defender's unchanged rating", () => {
  const state = duel();
  const start = montarPayloadInicio(state, true);
  assert.equal(start.resync, true);
  assert.equal(start.b.controladoPorIA, true);
  assert.equal(start.assincrono, true);
  assert.deepEqual(start.consumiveisA, []);
  assert.equal(start.consumiveisHabilitados, false);
  const rating = montarPayloadRating({ duelId: state.id, duelo: state, resultado: { ratingAntes: 1000, ratingDepois: 1018, delta: 18 } });
  assert.equal(rating.ratingDefensorInalterado, 1050);
  assert.equal(rating.delta, 18);
});

test("turn/end serializers expose public status and retain conditional turn fields", () => {
  const state = duel();
  const turn = montarPayloadTurno({ duelo: state, duelId: state.id, chave: "A", nomeAcao: "Golpe", foiAutomatico: true, dano: 8, cura: 0, manaCurada: 0, esquivou: false, critico: 0, bloqueado: false, logStatus: [] });
  assert.equal(turn.nomeAcao, "Golpe (tempo esgotado)");
  assert.deepEqual(turn.statusA, [{ key: "BURN", remainingTurns: 2, stacks: 1 }]);
  assert.equal(Object.hasOwn(turn, "turnoDe"), false);
  assert.deepEqual(turn.combatBuffsA, []);
  const end = montarPayloadFim({ duelId: 10, vencedorChave: "A", vencedor: state.a, perdedor: state.b, recompensa: { ouro: 5 }, nivelAposVitoria: 2, motivo: "Vitoria" });
  assert.deepEqual(end.vencedor, { id: 1, nome: "Herói 1" });
  assert.equal(Object.hasOwn(end.vencedor, "estado"), false);
});

test("party resync respects turn order and optional level penalty", () => {
  const state = { id: "party-1", zona: { id: 1 }, inimigo: { nome: "Monstro", nivel: 3, vida_atual: 40, vida_maxima: 90 }, ordem: ["2", "1"], membros: new Map([["1", fighter(1)], ["2", fighter(2)]]), turnoIndex: 1, rodada: 4 };
  const payload = montarPayloadBatalha(state);
  assert.equal(payload.turnoDe, "1");
  assert.deepEqual(payload.membros.map((m) => m.id), [2, 1]);
  assert.equal(payload.penalidadeDiferencaNivel, null);
  state.penalidadeDiferencaNivel = { aplicada: true, multiplicador: 0.5, diferenca: 20 };
  assert.deepEqual(montarPayloadBatalha(state).penalidadeDiferencaNivel, { multiplicador: 0.5, diferencaNivel: 20 });
});
