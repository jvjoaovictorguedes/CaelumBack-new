// Templo do Véu Celestial (templo_veu_celestial_v1_caelum.docx) — Fase
// 3: progresso event-driven das Provações (§4.3). Mesmo princípio de
// adventureGuildObjectiveService.registrarProgressoContrato: quem
// chama já confirmou um evento REAL do servidor (vitória de combate,
// craft, expedição concluída, etc.) e passa a MESMA transaction —
// nunca um endpoint que aceite progresso cru do cliente. objective_type
// é sempre lido do config_snapshot CONGELADO do evento (nunca do
// catálogo TempleMission editável), então editar uma Provação depois
// que a Convergência ativou nunca muda uma tentativa em andamento.
const TempleEvent = require("../models/TempleEvent");
const CharacterTempleMissionProgress = require("../models/CharacterTempleMissionProgress");
const CharacterTempleProgress = require("../models/CharacterTempleProgress");
const CharacterInventory = require("../models/CharacterInventory");
const inventoryService = require("./inventoryService");
const { EVENT_STATUS, MISSION_CATEGORY, OBJECTIVE_TYPE } = require("../config/templeConfig");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

// §4.1 — Rito Diário reseta por ciclo global diário (data UTC);
// Provação Principal nunca reseta ("once" cobre a Convergência
// inteira, não o personagem — cada Convergência tem key própria então
// um "once" de uma não colide com o "once" de outra).
function cycleKeyPara(categoria) {
  if (categoria === MISSION_CATEGORY.RITO_DIARIO) {
    return new Date().toISOString().slice(0, 10);
  }
  return "once";
}

const RARIDADE_RANK = ["Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"];

// §4.2 — um handler por objective_type, puro (sem IO): dado o
// objective_config da missão (congelado no snapshot) e o contexto REAL
// do evento que acabou de acontecer, devolve quanto incrementar e,
// pros tipos de SET (WIN_DISTINCT_ZONES), o novo state_json. Nenhum
// handler aqui decide "completar" (isso é genérico, por meta) — só
// "este evento conta pra esta missão, e quanto".
const HANDLERS = {
  [OBJECTIVE_TYPE.WIN_ADVENTURE_NO_CONSUMABLE]: (config, contexto) => {
    if (contexto.tipoEvento !== "ADVENTURE_WIN") return null;
    if (contexto.usouConsumivel) return null;
    return { incremento: 1 };
  },
  [OBJECTIVE_TYPE.APPLY_STATUS]: (config, contexto) => {
    if (contexto.tipoEvento !== "STATUS_APPLIED") return null;
    if (config.statusKey && config.statusKey !== contexto.statusKey) return null;
    return { incremento: 1 };
  },
  [OBJECTIVE_TYPE.DEFEAT_AFFECTED_BY_STATUS]: (config, contexto) => {
    if (contexto.tipoEvento !== "ADVENTURE_WIN") return null;
    const statusDoInimigo = contexto.statusDoInimigo ?? [];
    if (statusDoInimigo.length === 0) return null;
    const statusAlvo = Array.isArray(config.statusKeys) && config.statusKeys.length > 0 ? config.statusKeys : null;
    const bate = statusAlvo ? statusDoInimigo.some((k) => statusAlvo.includes(k)) : true;
    if (!bate) return null;
    return { incremento: 1 };
  },
  [OBJECTIVE_TYPE.WIN_DISTINCT_ZONES]: (config, contexto, estadoAtual) => {
    if (contexto.tipoEvento !== "ADVENTURE_WIN") return null;
    if (!contexto.zoneId) return null;
    const zonas = new Set(estadoAtual?.zonasVencidas ?? []);
    if (zonas.has(contexto.zoneId)) return { incremento: 0 };
    zonas.add(contexto.zoneId);
    return { incremento: 1, novoState: { zonasVencidas: [...zonas] }, progressoAbsoluto: zonas.size };
  },
  [OBJECTIVE_TYPE.FINAL_BLOW_WITH_POWER]: (config, contexto) => {
    if (contexto.tipoEvento !== "ADVENTURE_WIN") return null;
    if (!contexto.golpeFinalComPoder) return null;
    return { incremento: 1 };
  },
  [OBJECTIVE_TYPE.CRAFT_RARITY_OR_HIGHER]: (config, contexto) => {
    if (contexto.tipoEvento !== "CRAFT_SUCCESS") return null;
    const minRank = RARIDADE_RANK.indexOf(config.minRaridade ?? "Comum");
    const rank = RARIDADE_RANK.indexOf(contexto.raridade);
    if (rank < 0 || rank < minRank) return null;
    return { incremento: 1 };
  },
  [OBJECTIVE_TYPE.COMPLETE_EXPEDITIONS]: (config, contexto) => {
    if (contexto.tipoEvento !== "EXPEDITION_COMPLETE") return null;
    return { incremento: 1 };
  },
  [OBJECTIVE_TYPE.PARTY_ADVENTURE_WINS]: (config, contexto) => {
    if (contexto.tipoEvento !== "PARTY_ADVENTURE_WIN") return null;
    return { incremento: 1 };
  },
  // DELIVER_ITEM nunca passa por aqui — é uma ação explícita
  // (entregarItem, abaixo), que debita o inventário na mesma
  // transaction em vez de só contar um evento passivo.
  [OBJECTIVE_TYPE.DELIVER_ITEM]: () => null,
  [OBJECTIVE_TYPE.CLEANSE_STATUS]: (config, contexto) => {
    if (contexto.tipoEvento !== "CLEANSE_APPLIED") return null;
    return { incremento: 1 };
  },
};

async function obterEventoAtivo(transaction) {
  return TempleEvent.findOne({ where: { status: EVENT_STATUS.ACTIVE }, transaction });
}

// §4.4 — registra boss_unlocked_at UMA única vez quando todas as
// PROVACAO_PRINCIPAL do snapshot estiverem completed (claimed ou não —
// o desbloqueio é por CONCLUSÃO, resgatar a recompensa de Sigilos é
// independente). Ritos Diários nunca entram nessa conta.
async function verificarDesbloqueioDoBoss(evento, characterId, transaction) {
  const missoesPrincipais = (evento.config_snapshot?.missions ?? []).filter(
    (m) => m.categoria === MISSION_CATEGORY.PROVACAO_PRINCIPAL,
  );
  if (missoesPrincipais.length === 0) return null;

  const progresso = await CharacterTempleMissionProgress.findAll({
    where: {
      id_event: evento.id,
      character_id: characterId,
      mission_key: missoesPrincipais.map((m) => m.key),
      cycle_key: "once",
    },
    transaction,
  });
  const concluidas = new Set(progresso.filter((p) => p.completed_at).map((p) => p.mission_key));
  const todasConcluidas = missoesPrincipais.every((m) => concluidas.has(m.key));
  if (!todasConcluidas) return null;

  const [charProgress] = await CharacterTempleProgress.findOrCreate({
    where: { id_event: evento.id, character_id: characterId },
    defaults: { id_event: evento.id, character_id: characterId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (charProgress.boss_unlocked_at) return charProgress;

  charProgress.boss_unlocked_at = new Date();
  await charProgress.save({ transaction });
  return charProgress;
}

// §4.3 — ponto único de entrada: avalia TODAS as missões ativas do
// snapshot cujo objective_type bate com o evento, incrementa cada uma
// (lock por linha, idempotente — nunca passa de meta nem reabre uma
// já completed), e checa desbloqueio do Boss se alguma Provação
// Principal foi concluída agora. Retorna a lista de missões concluídas
// NESTA chamada (pro caller logar/notificar), nunca lança se não achar
// nenhuma missão compatível — a maioria dos eventos reais do jogo não
// tem Convergência ativa alguma.
async function registrarProgresso(characterId, objectiveType, contexto, transaction) {
  if (!await require("./templeReleaseService").backgroundEnabled(transaction)) return [];
  const evento = await obterEventoAtivo(transaction);
  if (!evento) return [];

  const missoes = (evento.config_snapshot?.missions ?? []).filter((m) => m.objective_type === objectiveType);
  if (missoes.length === 0) return [];

  const concluidasAgora = [];
  for (const missao of missoes) {
    const cycleKey = cycleKeyPara(missao.categoria);
    const [progresso] = await CharacterTempleMissionProgress.findOrCreate({
      where: { id_event: evento.id, character_id: characterId, mission_key: missao.key, cycle_key: cycleKey },
      defaults: { id_event: evento.id, character_id: characterId, mission_key: missao.key, cycle_key: cycleKey },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (progresso.completed_at) continue;

    const handler = HANDLERS[objectiveType];
    const resultado = handler ? handler(missao.objective_config ?? {}, contexto, progresso.state_json) : null;
    if (!resultado) continue;

    if (resultado.novoState) progresso.state_json = resultado.novoState;
    progresso.progresso_atual =
      resultado.progressoAbsoluto ?? Math.min(missao.meta, progresso.progresso_atual + resultado.incremento);
    if (progresso.progresso_atual >= missao.meta) {
      progresso.progresso_atual = missao.meta;
      progresso.completed_at = new Date();
      concluidasAgora.push(missao);
    }
    await progresso.save({ transaction });
  }

  if (concluidasAgora.some((m) => m.categoria === MISSION_CATEGORY.PROVACAO_PRINCIPAL)) {
    await verificarDesbloqueioDoBoss(evento, characterId, transaction);
  }

  return concluidasAgora;
}

// §4.3 "Entregar" — ação explícita do jogador (nunca passiva): remove
// o item pedido do inventário e progride a missão na MESMA
// transaction, pra nunca debitar sem progredir (ou vice-versa).
async function entregarItem(characterId, missionKey, transaction) {
  const evento = await obterEventoAtivo(transaction);
  if (!evento) throw erro("Não há Convergência ativa agora.");

  const missao = (evento.config_snapshot?.missions ?? []).find((m) => m.key === missionKey);
  if (!missao) throw erro("Provação não encontrada nesta Convergência.", 404);
  if (missao.objective_type !== OBJECTIVE_TYPE.DELIVER_ITEM) {
    throw erro("Esta Provação não é do tipo Entrega.");
  }

  const cycleKey = cycleKeyPara(missao.categoria);
  const [progresso] = await CharacterTempleMissionProgress.findOrCreate({
    where: { id_event: evento.id, character_id: characterId, mission_key: missao.key, cycle_key: cycleKey },
    defaults: { id_event: evento.id, character_id: characterId, mission_key: missao.key, cycle_key: cycleKey },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (progresso.completed_at) throw erro("Você já entregou o que esta Provação pedia.");

  const { itemId, quantidade } = missao.objective_config ?? {};
  if (!itemId || !quantidade) throw erro("Provação de Entrega configurada incorretamente.", 500);

  await inventoryService.removeStack(characterId, itemId, quantidade, transaction);

  progresso.progresso_atual = missao.meta;
  progresso.completed_at = new Date();
  await progresso.save({ transaction });

  if (missao.categoria === MISSION_CATEGORY.PROVACAO_PRINCIPAL) {
    await verificarDesbloqueioDoBoss(evento, characterId, transaction);
  }
  return progresso;
}

// §5.2/§11.2 — resgatar os Sigilos de uma missão já concluída. Separado
// de "completar" de propósito (§13.2 mostra progresso ANTES do
// resgate) — concluir só marca completed_at; resgatar é quem credita a
// moeda, idempotente por claimed_at.
async function reclamarRecompensa(characterId, missionKey, transaction) {
  const evento = await obterEventoAtivo(transaction);
  if (!evento) throw erro("Não há Convergência ativa agora.");

  const missao = (evento.config_snapshot?.missions ?? []).find((m) => m.key === missionKey);
  if (!missao) throw erro("Provação não encontrada nesta Convergência.", 404);

  const cycleKey = cycleKeyPara(missao.categoria);
  const progresso = await CharacterTempleMissionProgress.findOne({
    where: { id_event: evento.id, character_id: characterId, mission_key: missao.key, cycle_key: cycleKey },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!progresso?.completed_at) throw erro("Esta Provação ainda não foi concluída.");
  if (progresso.claimed_at) throw erro("Você já resgatou a recompensa desta Provação.");

  if (missao.reward_sigils > 0) {
    await inventoryService.addStack(characterId, evento.id_currency_item, missao.reward_sigils, transaction);
  }
  progresso.claimed_at = new Date();
  await progresso.save({ transaction });
  return { progresso, sigilosGanhos: missao.reward_sigils };
}

// §13.2 — listagem pro jogador: progresso de TODAS as missões ativas
// do snapshot, mesmo as ainda não iniciadas (progresso 0, sem linha
// ainda criada em CharacterTempleMissionProgress).
async function listarMissoes(characterId) {
  const evento = await obterEventoAtivo();
  if (!evento) return { event_id: null, missions: [] };

  const missoes = evento.config_snapshot?.missions ?? [];
  const progresso = await CharacterTempleMissionProgress.findAll({
    where: {
      id_event: evento.id,
      character_id: characterId,
      mission_key: missoes.map((m) => m.key),
    },
  });
  const progressoPorChave = new Map();
  for (const p of progresso) {
    const chave = `${p.mission_key}:${p.cycle_key}`;
    progressoPorChave.set(chave, p);
  }

  return {
    event_id: evento.id,
    missions: missoes.map((missao) => {
      const cycleKey = cycleKeyPara(missao.categoria);
      const p = progressoPorChave.get(`${missao.key}:${cycleKey}`);
      return {
        key: missao.key,
        categoria: missao.categoria,
        nome_exibicao: missao.nome_exibicao,
        descricao: missao.descricao,
        meta: missao.meta,
        reward_sigils: missao.reward_sigils,
        objective_type: missao.objective_type,
        progresso_atual: p?.progresso_atual ?? 0,
        completed_at: p?.completed_at ?? null,
        claimed_at: p?.claimed_at ?? null,
      };
    }),
  };
}

module.exports = {
  cycleKeyPara,
  obterEventoAtivo,
  registrarProgresso,
  entregarItem,
  reclamarRecompensa,
  listarMissoes,
  verificarDesbloqueioDoBoss,
};
