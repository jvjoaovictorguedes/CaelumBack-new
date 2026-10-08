// Templo do Véu Celestial (templo_veu_celestial_v1_caelum.docx) — Fase
// 2: ciclo de vida da Convergência (§3). Diferente do Boss Global, não
// existe seleção ponderada entre "configs" nem threshold secreto — o
// Admin cria e agenda CADA Convergência explicitamente (§12.1), com
// datas próprias; o scheduler só PROMOVE estado quando a data já
// passou (§3.2 "scheduler deve promover estados idempotentemente;
// toda rota também valida datas no servidor, scheduler não é
// segurança").
const TempleEvent = require("../models/TempleEvent");
const TempleMission = require("../models/TempleMission");
const TempleRewardPool = require("../models/TempleRewardPool");
const TempleRewardEntry = require("../models/TempleRewardEntry");
const { EVENT_STATUS } = require("../config/templeConfig");

// §12.2 — versão do formato do snapshot, só pra diagnóstico/telemetria
// (mesmo princípio de worldBossLifecycleService.SNAPSHOT_SCHEMA_VERSION
// — a leitura nunca trava num schema_version específico). Esta Fase
// só congela Provações; Relicário (Fase 4) e Guardião (Fase 5) entram
// no MESMO snapshot depois, sem precisar de migration nova
// (config_snapshot já é JSONB livre).
const SNAPSHOT_SCHEMA_VERSION = 1;

async function existeEventoAberto(transaction) {
  const evento = await TempleEvent.findOne({
    where: { status: [EVENT_STATUS.ACTIVE, EVENT_STATUS.RELICARY_ONLY] },
    transaction,
  });
  return Boolean(evento);
}

// §12.2 — freeze congelado na ativação. Editar o catálogo (TempleMission/
// TempleRewardPool/TempleBossConfig) depois NUNCA muda uma Convergência
// já em andamento — o runtime do evento lê só isto.
async function montarSnapshotRelicario(evento, transaction) {
  const pool = await TempleRewardPool.findOne({
    where: { id_event: evento.id, ativo: true },
    transaction,
  });
  if (!pool) return null;

  const entradas = await TempleRewardEntry.findAll({
    where: { id_pool: pool.id, ativo: true },
    order: [["ordem", "ASC"]],
    transaction,
  });
  if (entradas.length === 0) return null;

  return {
    pool_id: pool.id,
    nome: pool.nome,
    custo_sigilos_draw: pool.custo_sigilos_draw,
    pity_raro_mais_garantia: pool.pity_raro_mais_garantia,
    pity_featured_garantia: pool.pity_featured_garantia,
    entries: entradas.map((entrada) => ({
      key: entrada.key,
      reward_kind: entrada.reward_kind,
      id_item: entrada.id_item,
      quantidade: entrada.quantidade,
      raridade_instancia: entrada.raridade_instancia,
      weight: entrada.weight,
      eh_raro_mais: entrada.eh_raro_mais,
      eh_featured: entrada.eh_featured,
      eh_unico: entrada.eh_unico,
      fallback_key: entrada.fallback_key,
      nome_exibicao: entrada.nome_exibicao,
    })),
  };
}

async function montarSnapshot(evento, transaction) {
  const missoes = await TempleMission.findAll({
    where: { id_event: evento.id, ativo: true },
    order: [["ordem", "ASC"]],
    transaction,
  });
  const relicary = await montarSnapshotRelicario(evento, transaction);

  return {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    nome: evento.nome,
    lore: evento.lore,
    imagem_url: evento.imagem_url,
    id_currency_item: evento.id_currency_item,
    missions: missoes.map((missao) => ({
      id: missao.id,
      key: missao.key,
      categoria: missao.categoria,
      objective_type: missao.objective_type,
      objective_config: missao.objective_config,
      meta: missao.meta,
      reward_sigils: missao.reward_sigils,
      nome_exibicao: missao.nome_exibicao,
      descricao: missao.descricao,
      ordem: missao.ordem,
    })),
    // §12.2 — relicary agora congela o pool/entries ativos do evento no
    // momento da ativação (null se o Admin não montou nenhum pool, ou
    // montou um sem entries — nunca um objeto "pronto" pela metade).
    // Guardião (Fase 5) preenche esta chave quando a Fase existir.
    relicary,
    boss: null,
  };
}

// SCHEDULED -> ACTIVE. Congela o snapshot e marca a transição — nunca
// chamada direto pelo Admin pra "pular a espera" (diferente do Boss
// Global): a Convergência é só UMA tentativa com data própria, então
// pular a espera é só reagendar starts_at, não forçar o estado.
async function ativarEvento(evento, transaction) {
  evento.config_snapshot = await montarSnapshot(evento, transaction);
  evento.status = EVENT_STATUS.ACTIVE;
  await evento.save({ transaction });
  return evento;
}

// §3.2/§12.3 — promove TODAS as transições cuja data já passou, numa
// única passada idempotente: SCHEDULED->ACTIVE (se starts_at passou),
// ACTIVE->RELICARY_ONLY (se missions_end_at passou),
// RELICARY_ONLY->ENDED (se relicary_end_at passou). Nunca reativa nem
// retrocede — cada evento só anda PRA FRENTE, uma transição por tick é
// suficiente porque o próprio tick seguinte (15s, bem mais curto que
// qualquer janela real) cobre o próximo estágio.
async function promoverEstados(transaction) {
  const promovidos = [];
  const agora = new Date();

  const agendados = await TempleEvent.findAll({
    where: { status: EVENT_STATUS.SCHEDULED },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  for (const evento of agendados) {
    if (!evento.starts_at || new Date(evento.starts_at).getTime() > agora.getTime()) continue;
    // §12.3 — só um ACTIVE/RELICARY_ONLY por vez (índice único parcial
    // no banco); se outra Convergência já está aberta, esta fica
    // esperando (nunca força o estado, nunca derruba a outra).
    if (await existeEventoAberto(transaction)) continue;
    await ativarEvento(evento, transaction);
    promovidos.push(evento);
  }

  const ativos = await TempleEvent.findAll({
    where: { status: EVENT_STATUS.ACTIVE },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  for (const evento of ativos) {
    if (!evento.missions_end_at || new Date(evento.missions_end_at).getTime() > agora.getTime()) continue;
    evento.status = EVENT_STATUS.RELICARY_ONLY;
    await evento.save({ transaction });
    promovidos.push(evento);
  }

  const relicarioOnly = await TempleEvent.findAll({
    where: { status: EVENT_STATUS.RELICARY_ONLY },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  for (const evento of relicarioOnly) {
    if (!evento.relicary_end_at || new Date(evento.relicary_end_at).getTime() > agora.getTime()) continue;
    evento.status = EVENT_STATUS.ENDED;
    evento.ended_at = agora;
    await evento.save({ transaction });
    promovidos.push(evento);
  }

  return promovidos;
}

module.exports = {
  existeEventoAberto,
  montarSnapshot,
  ativarEvento,
  promoverEstados,
  SNAPSHOT_SCHEMA_VERSION,
};
