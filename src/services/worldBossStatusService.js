// Boss Global — Fase 3: status público do evento atual (§5.2/§11).
// NUNCA devolve discovery_threshold/discovery_progress (a ameaça
// precisa continuar "escondida" até ser descoberta): enquanto o
// evento está em COOLDOWN/DORMANT, o mundo simplesmente não sabe que
// ele existe — só a partir de DISCOVERED é que há algo pra mostrar.
const WorldBossEvent = require("../models/WorldBossEvent");
const Character = require("../models/Character");
const { EVENT_STATUS } = require("../config/worldBossConfig");

const STATUS_PUBLICOS = [
  EVENT_STATUS.DISCOVERED,
  EVENT_STATUS.ACTIVE,
  EVENT_STATUS.DEFEATED,
  EVENT_STATUS.CANCELLED,
];

// Fase ativa é a de MENOR hp_percentual_max cujo limite ainda cobre o
// HP% atual (faixas não se sobrepõem — §11 — então só uma bate).
function faseAtualDoSnapshot(snapshot, hpPercentual) {
  const fases = Array.isArray(snapshot?.fases) ? snapshot.fases : [];
  const ordenadas = [...fases].sort((a, b) => a.hp_percentual_max - b.hp_percentual_max);
  return ordenadas.find((fase) => hpPercentual <= fase.hp_percentual_max) ?? ordenadas[ordenadas.length - 1] ?? null;
}

async function obterStatusPublico() {
  const evento = await WorldBossEvent.findOne({
    where: { status: STATUS_PUBLICOS },
    order: [["id", "DESC"]],
  });
  if (!evento) return { status: "Nenhum" };

  const snapshot = evento.config_snapshot ?? {};
  const hpMax = Number(evento.hp_max);
  const hpCurrent = Math.max(0, Number(evento.hp_current));
  const hpPercentual = hpMax > 0 ? (hpCurrent / hpMax) * 100 : 0;

  const [descobridor, golpeFinalPor] = await Promise.all([
    evento.discoverer_character_id ? Character.findByPk(evento.discoverer_character_id) : null,
    evento.final_blow_character_id ? Character.findByPk(evento.final_blow_character_id) : null,
  ]);

  return {
    status: evento.status,
    event_id: evento.id,
    nome: snapshot.nome ?? null,
    descricao: snapshot.descricao ?? null,
    lore: snapshot.lore ?? null,
    imagem_url: snapshot.imagem_url ?? null,
    mensagem_convocacao: snapshot.mensagem_convocacao ?? null,
    mensagem_fase_final: snapshot.mensagem_fase_final ?? null,
    mensagem_derrota: snapshot.mensagem_derrota ?? null,
    hp_max: hpMax,
    hp_current: hpCurrent,
    hp_percentual: Math.round(hpPercentual * 100) / 100,
    fase_atual: faseAtualDoSnapshot(snapshot, hpPercentual),
    discovered_at: evento.discovered_at,
    activated_at: evento.activated_at,
    auto_awaken_at: evento.status === EVENT_STATUS.DISCOVERED ? evento.auto_awaken_at : null,
    defeated_at: evento.defeated_at,
    descobridor: descobridor ? { id: descobridor.id, nome: descobridor.nome } : null,
    golpe_final_por: golpeFinalPor ? { id: golpeFinalPor.id, nome: golpeFinalPor.nome } : null,
  };
}

module.exports = { obterStatusPublico, faseAtualDoSnapshot };
