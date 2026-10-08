const fs = require("node:fs");
const path = require("node:path");
const events = require("../src/contracts/socketEvents");
const { montarPayloadDuelo, montarPayloadTurno, montarPayloadFim } = require("../src/contracts/pvpPayloads");
const { montarPayloadInicio, montarPayloadRating } = require("../src/contracts/rankedPayloads");
const { montarPayloadBatalha } = require("../src/contracts/partyPayloads");

function buildFixtures() {
  const fighter = (id) => ({ id, nome: `Herói ${id}`, genero: "Masculino", classe: "Guerreiro", vidaMax: 100, manaMax: 50,
    estado: { vida_atual: 70, mana_atual: 30 }, poderes: [{ id: 9, combat_slot: 4, nome: "Golpe", custo_mana: 5, dano_base: 20, cura_base: 0, nivel_habilidade: 1, escala_atributo: "Forca", valor_escala: 0.5 }], consumiveis: [] });
  const duel = { id: 10, arena: "Arena", torneio: null, a: fighter(1), b: fighter(2), turnoDe: "B", rankedMatchId: 11,
    seasonId: 3, ratingAntes: { A: 1000, B: 1050 }, ia: "B", statusEffects: { A: [{ key: "BURN", remainingTurns: 2, stacks: 1 }], B: [] } };
  const party = { id: 20, zona: { id: 1, nome: "Campos" }, inimigo: { nome: "Monstro", nivel: 3, vida_atual: 40, vida_maxima: 90, imagem_url: null },
    ordem: ["2", "1"], membros: new Map([["1", fighter(1)], ["2", fighter(2)]]), turnoIndex: 1, rodada: 4 };
  return JSON.parse(JSON.stringify({
    events,
    casual: montarPayloadDuelo(duel),
    ranked: montarPayloadInicio(duel, true),
    rating: montarPayloadRating({ duelId: duel.id, duelo: duel, resultado: { ratingAntes: 1000, ratingDepois: 1018, delta: 18 } }),
    turn: { ...montarPayloadTurno({ duelo: duel, duelId: duel.id, chave: "A", nomeAcao: "Golpe", foiAutomatico: false, dano: 8,
      cura: 0, manaCurada: 0, esquivou: false, critico: false, bloqueado: false, logStatus: [] }), turnoDe: "B", prazoSegundos: 5 },
    end: montarPayloadFim({ duelId: duel.id, vencedorChave: "A", vencedor: duel.a, perdedor: duel.b,
      recompensa: { dinheiro: 5, experiencia: 7 }, nivelAposVitoria: 2, motivo: "combate" }),
    party: montarPayloadBatalha(party),
  }));
}

function typescriptFixture(fixtures) {
  return `// Generated from backend serializers by scripts/export-combat-contracts.js.
import type { DueloIniciadoPayload, TurnoResultadoPayload, DueloFimPayload } from "../../src/types/contracts/pvp";
import type { RankedRatingUpdatePayload } from "../../src/types/contracts/ranked";
import type { BatalhaGrupoIniciadaPayload } from "../../src/types/contracts/party";
import type { SOCKET_EVENTS } from "../../src/types/contracts/socketEvents";

export const combatContracts = ${JSON.stringify(fixtures, null, 2)} satisfies {
  events: typeof SOCKET_EVENTS;
  casual: DueloIniciadoPayload;
  ranked: DueloIniciadoPayload;
  rating: RankedRatingUpdatePayload;
  turn: TurnoResultadoPayload;
  end: DueloFimPayload;
  party: BatalhaGrupoIniciadaPayload;
};
`;
}

if (require.main === module) {
  const fixtures = buildFixtures();
  const backendFile = path.resolve(__dirname, "../test/fixtures/combat-contracts.json");
  fs.writeFileSync(backendFile, JSON.stringify(fixtures, null, 2) + "\n");
  if (process.argv[2]) {
    const folder = path.resolve(process.argv[2]);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, "combat-contracts.json"), JSON.stringify(fixtures, null, 2) + "\n");
    fs.writeFileSync(path.join(folder, "combat-contracts.ts"), typescriptFixture(fixtures));
  }
  console.log("Exported synthetic combat contract fixtures (no database access).");
}
module.exports = { buildFixtures, typescriptFixture };
