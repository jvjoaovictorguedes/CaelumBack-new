// Ameaça Mundial V2 — Etapa 8: Ranking/finalização (§10).
//
// WorldBossContribution continua a ÚNICA fonte de verdade de dano
// (§10.1) — nunca duplicar damage_total em outro lugar. O congelamento
// do vencedor oficial (top_damage_character_id/top_damage_total) já
// acontece dentro da MESMA transação do Golpe Final
// (worldBossCombatService.executarAcao, §10.7); este arquivo só LÊ e
// formata pra exibição — nunca decide vencedor sozinho.
const Character = require("../models/Character");
const WorldBossEvent = require("../models/WorldBossEvent");
const WorldBossContribution = require("../models/WorldBossContribution");
const { EVENT_STATUS } = require("../config/worldBossConfig");

// §10.5 — desempate determinístico: maior damage_total, depois quem
// chegou lá primeiro (last_damage_at mais antigo — nunca last_action_at,
// que avança até numa esquiva sem dano nenhum), depois character_id
// como fallback final.
const ORDEM_DESEMPATE = [
  ["damage_total", "DESC"],
  ["last_damage_at", "ASC"],
  ["character_id", "ASC"],
];

async function eventoParaRanking(eventId) {
  if (eventId) return WorldBossEvent.findByPk(eventId);
  return WorldBossEvent.findOne({
    where: { status: [EVENT_STATUS.ACTIVE, EVENT_STATUS.DEFEATED] },
    order: [["id", "DESC"]],
  });
}

// §10.3 — damage_percent usa o HP ORIGINAL do evento (hp_max), nunca o
// HP restante; overkill já não vaza pra dentro de damage_total desde a
// Fase 4 (danoEfetivo é sempre hp_antes-hp_depois, nunca o dano bruto).
function comPercentual(contribuicao, hpMax) {
  return hpMax > 0 ? Math.round((Number(contribuicao.damage_total) / hpMax) * 10000) / 100 : 0;
}

// §10.4 — badges são independentes entre si e nunca substituem a
// posição no ranking; um personagem pode ter 0, 1, 2 ou os 3.
// MAIOR_DANO só existe DEPOIS do evento concluído (top_damage_
// character_id só é preenchido no Golpe Final) — durante o combate o
// 1º colocado é rotulado "Líder de dano", nunca "Maior Dano" oficial
// (§10.2, decidido pelo front a partir de `lider_oficial` abaixo).
function badgesDoPersonagem(characterId, evento) {
  const badges = [];
  if (evento.top_damage_character_id === characterId) badges.push("MAIOR_DANO");
  if (evento.final_blow_character_id === characterId) badges.push("GOLPE_FINAL");
  if (evento.discoverer_character_id === characterId) badges.push("DESCOBRIDOR");
  return badges;
}

function linhaDoRanking(contribuicao, posicao, evento, hpMax, nomesPorId) {
  return {
    posicao,
    character_id: contribuicao.character_id,
    nome: nomesPorId.get(contribuicao.character_id) ?? null,
    damage_total: Number(contribuicao.damage_total),
    damage_percent: comPercentual(contribuicao, hpMax),
    badges: badgesDoPersonagem(contribuicao.character_id, evento),
  };
}

// Top N (§10.2) + a posição de UM personagem específico quando ele não
// está no Top N (nunca esconder a própria posição do jogador). O
// evento raramente passa de algumas centenas/milhares de participantes
// simultâneos — buscar a lista ordenada inteira uma vez pra achar um
// índice é mais simples e igualmente correto que replicar
// ORDEM_DESEMPATE numa query bruta, e ainda é só leitura.
async function obterRanking({ eventId, limit = 10, characterId } = {}) {
  const evento = await eventoParaRanking(eventId);
  if (!evento) return { event_id: null, status: null, top: [], minha_posicao: null };

  const hpMax = Number(evento.hp_max) || 0;
  const limiteSeguro = Math.max(1, Math.min(100, Number(limit) || 10));

  const todasOrdenadas = await WorldBossContribution.findAll({
    where: { event_id: evento.id },
    order: ORDEM_DESEMPATE,
  });

  const topContribuicoes = todasOrdenadas.slice(0, limiteSeguro);
  const posicaoDoJogador = characterId ? todasOrdenadas.findIndex((c) => c.character_id === characterId) : -1;
  const minhaContribuicao = posicaoDoJogador >= 0 ? todasOrdenadas[posicaoDoJogador] : null;

  const idsParaNome = new Set(topContribuicoes.map((c) => c.character_id));
  if (minhaContribuicao) idsParaNome.add(characterId);
  const personagens = idsParaNome.size > 0 ? await Character.findAll({ where: { id: [...idsParaNome] } }) : [];
  const nomesPorId = new Map(personagens.map((p) => [p.id, p.nome]));

  const top = topContribuicoes.map((c, i) => linhaDoRanking(c, i + 1, evento, hpMax, nomesPorId));
  const dentroDoTop = posicaoDoJogador >= 0 && posicaoDoJogador < limiteSeguro;
  const minha = minhaContribuicao && !dentroDoTop ? linhaDoRanking(minhaContribuicao, posicaoDoJogador + 1, evento, hpMax, nomesPorId) : null;

  return {
    event_id: evento.id,
    status: evento.status,
    // §10.2 — só depois de DEFEATED o 1º colocado é "Maior Dano"
    // oficial; enquanto ACTIVE, o front rotula como "Líder de dano".
    lider_oficial: evento.status === EVENT_STATUS.DEFEATED,
    top,
    minha_posicao: minha,
  };
}

module.exports = { obterRanking, ORDEM_DESEMPATE };
