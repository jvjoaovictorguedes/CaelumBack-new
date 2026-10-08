// Boss Global — Fase 3: status público do evento atual (§5.2/§11).
// NUNCA devolve discovery_threshold/discovery_progress (a ameaça
// precisa continuar "escondida" até ser descoberta): enquanto o
// evento está em COOLDOWN/DORMANT, o mundo simplesmente não sabe que
// ele existe — só a partir de DISCOVERED é que há algo pra mostrar.
const WorldBossEvent = require("../models/WorldBossEvent");
const Character = require("../models/Character");
const AdventureZone = require("../models/AdventureZone");
const { EVENT_STATUS } = require("../config/worldBossConfig");

const STATUS_PUBLICOS = [
  EVENT_STATUS.DISCOVERED,
  EVENT_STATUS.ACTIVE,
  EVENT_STATUS.DEFEATED,
  EVENT_STATUS.CANCELLED,
  EVENT_STATUS.FAILED,
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

  const [descobridor, golpeFinalPor, maiorDanoPor, zonaDescoberta] = await Promise.all([
    evento.discoverer_character_id ? Character.findByPk(evento.discoverer_character_id) : null,
    evento.final_blow_character_id ? Character.findByPk(evento.final_blow_character_id) : null,
    // §11.1 — TOP_DAMAGE só existe congelado depois de DEFEATED (§10.7);
    // pra o card "Em combate" (§12.2), o "Líder de dano" ao vivo vem do
    // ranking (worldBossRankingService), nunca daqui.
    evento.top_damage_character_id ? Character.findByPk(evento.top_damage_character_id) : null,
    // §12.1 — zona da descoberta: já persistida desde a Fase 2, só
    // faltava expor no status público (Guilda dos Aventureiros, §12).
    evento.discovery_zone_id ? AdventureZone.findByPk(evento.discovery_zone_id) : null,
  ]);

  return {
    status: evento.status,
    event_id: evento.id,
    nome: snapshot.nome ?? null,
    descricao: snapshot.descricao ?? null,
    lore: snapshot.lore ?? null,
    imagem_url: snapshot.imagem_url ?? null,
    fundo_url: snapshot.fundo_url ?? null,
    mensagem_convocacao: snapshot.mensagem_convocacao ?? null,
    mensagem_fase_final: snapshot.mensagem_fase_final ?? null,
    mensagem_derrota: snapshot.mensagem_derrota ?? null,
    hp_max: hpMax,
    hp_current: hpCurrent,
    hp_percentual: Math.round(hpPercentual * 100) / 100,
    fase_atual: faseAtualDoSnapshot(snapshot, hpPercentual),
    discovered_at: evento.discovered_at,
    activated_at: evento.activated_at,
    combat_expires_at:evento.combat_expires_at,remaining_ms:evento.combat_expires_at?Math.max(0,new Date(evento.combat_expires_at)-Date.now()):null,failed_at:evento.failed_at,failure_reason:evento.failure_reason,
    auto_awaken_at: evento.status === EVENT_STATUS.DISCOVERED ? evento.auto_awaken_at : null,
    defeated_at: evento.defeated_at,
    descobridor: descobridor ? { id: descobridor.id, nome: descobridor.nome } : null,
    // §12.1 — zona onde a Ameaça foi descoberta (Guilda dos Aventureiros).
    zona_descoberta: zonaDescoberta ? { id: zonaDescoberta.id, nome: zonaDescoberta.nome } : null,
    golpe_final_por: golpeFinalPor ? { id: golpeFinalPor.id, nome: golpeFinalPor.nome } : null,
    // §12.3 — card "Ameaça Derrotada": Maior Dano só é oficial depois de
    // DEFEATED (top_damage_character_id só é preenchido no Golpe Final).
    maior_dano_por: maiorDanoPor ? { id: maiorDanoPor.id, nome: maiorDanoPor.nome, damage_total: evento.top_damage_total ? Number(evento.top_damage_total) : null } : null,
    // §18.1/§18.3 — relógio de combate PÚBLICO (Furia/próxima ação/cast
    // em andamento): mesma leitura do runtime_v2 do admin, mas sem nada
    // sensível (nunca expõe threshold/progresso de descoberta, que
    // continua exclusivo do painel). null fora de ACTIVE — não faz
    // sentido "relógio de combate" pra quem ainda não despertou.
    combate: evento.status === EVENT_STATUS.ACTIVE ? relogioDeCombatePublico(evento) : null,
  };
}

function relogioDeCombatePublico(evento) {
  const castPendente = evento.runtime_state?.cast_pendente ?? null;
  const proximaAcaoEmMs = evento.next_action_at ? new Date(evento.next_action_at).getTime() - Date.now() : null;
  return {
    furia_atual_pct: Number(evento.furia_current_pct),
    boss_action_seq: evento.boss_action_seq,
    phase_action_seq: evento.phase_action_seq,
    proxima_acao_em_ms: proximaAcaoEmMs !== null ? Math.max(0, proximaAcaoEmMs) : null,
    cast_pendente: castPendente
      ? {
          power: castPendente.power_snapshot ? { id: castPendente.power_snapshot.id, nome: castPendente.power_snapshot.nome, imagem_url: castPendente.power_snapshot.imagem_url ?? null } : null,
          resolves_at: castPendente.resolves_at,
        }
      : null,
  };
}

// §12.4 — histórico consultivo: cada aparição é um WorldBossEvent
// diferente (nunca sobrescreve o catálogo). Só eventos FINALIZADOS
// (DEFEATED) — CANCELLED não é uma "aparição" pra mostrar na Guilda.
async function obterHistoricoRecente({ limit = 5 } = {}) {
  const eventos = await WorldBossEvent.findAll({
    where: { status: [EVENT_STATUS.DEFEATED,EVENT_STATUS.FAILED] },
    order: [["defeated_at", "DESC"]],
    limit: Math.max(1, Math.min(20, Number(limit) || 5)),
  });

  const idsPersonagens = new Set();
  for (const evento of eventos) {
    if (evento.discoverer_character_id) idsPersonagens.add(evento.discoverer_character_id);
    if (evento.final_blow_character_id) idsPersonagens.add(evento.final_blow_character_id);
    if (evento.top_damage_character_id) idsPersonagens.add(evento.top_damage_character_id);
  }
  const personagens = idsPersonagens.size > 0 ? await Character.findAll({ where: { id: [...idsPersonagens] } }) : [];
  const nomesPorId = new Map(personagens.map((p) => [p.id, p.nome]));

  return eventos.map((evento) => {
    const snapshot = evento.config_snapshot ?? {};
    return {
      event_id: evento.id,status:evento.status,failed_at:evento.failed_at,
      nome: snapshot.nome ?? null,
      imagem_url: snapshot.imagem_url ?? null,
      defeated_at: evento.defeated_at,
      activated_at: evento.activated_at,
      descobridor: evento.discoverer_character_id
        ? { id: evento.discoverer_character_id, nome: nomesPorId.get(evento.discoverer_character_id) ?? null }
        : null,
      golpe_final_por: evento.final_blow_character_id
        ? { id: evento.final_blow_character_id, nome: nomesPorId.get(evento.final_blow_character_id) ?? null }
        : null,
      maior_dano_por: evento.top_damage_character_id
        ? {
            id: evento.top_damage_character_id,
            nome: nomesPorId.get(evento.top_damage_character_id) ?? null,
            damage_total: evento.top_damage_total ? Number(evento.top_damage_total) : null,
          }
        : null,
    };
  });
}

module.exports = { obterStatusPublico, faseAtualDoSnapshot, obterHistoricoRecente };
