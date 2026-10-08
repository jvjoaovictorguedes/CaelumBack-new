// Evento "O Coração da Máquina Celestial" — Fase 1. EventEdition é UMA
// execução/temporada concreta de uma EventDefinition. Lifecycle próprio
// (nunca compartilhado com EventDefinition/Blueprint/Instance).
const { sequelize } = require("../config/database");
const { EventEdition } = require("../models/eventPuzzleModels");
const eventDefinitionService = require("./eventDefinitionService");

function erro(mensagem, statusCode = 400, code) {
  return Object.assign(new Error(mensagem), { statusCode, code });
}

// DRAFT → SCHEDULED → ACTIVE → ENDED. CANCELLED alcançável de qualquer
// estado não-terminal (desistir em qualquer momento antes do fim).
// Nenhuma transição de volta; ENDED/CANCELLED são terminais.
const TRANSICOES_VALIDAS = {
  DRAFT: ["SCHEDULED", "ACTIVE", "CANCELLED"],
  SCHEDULED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["ENDED", "CANCELLED"],
  ENDED: [],
  CANCELLED: [],
};

function transicaoValida(atual, novo) {
  return TRANSICOES_VALIDAS[atual]?.includes(novo) ?? false;
}

async function criar(idEventDefinition, { key, nome, starts_at, ends_at, metadata } = {}, transaction) {
  await eventDefinitionService.obterPorId(idEventDefinition, transaction);
  if (typeof key !== "string" || !/^[a-z0-9-]{3,60}$/.test(key)) {
    throw erro("Key inválida — use só letras minúsculas, números e hífen (3-60 caracteres).", 400);
  }
  if (typeof nome !== "string" || nome.trim().length < 3 || nome.length > 160) {
    throw erro("Nome inválido.", 400);
  }
  try {
    return await EventEdition.create(
      {
        id_event_definition: idEventDefinition,
        key,
        nome: nome.trim(),
        starts_at: starts_at ?? null,
        ends_at: ends_at ?? null,
        metadata: metadata ?? null,
      },
      { transaction },
    );
  } catch (e) {
    if (e.name === "SequelizeUniqueConstraintError") {
      throw erro("Já existe uma edição com essa key pra esse evento.", 409);
    }
    throw e;
  }
}

// Única porta de entrada pra mudar o lifecycle — nunca o controller
// setando `status` direto. O índice parcial `event_editions_uma_
// ativa_por_definicao` (banco) é a garantia REAL contra 2 edições
// ACTIVE da mesma definição em corrida; o catch abaixo só devolve um
// 409 limpo em vez de deixar a violação de constraint estourar como
// 500 — mesmo idioma de adventureHuntService.aceitarOferta.
async function transicionar(id, novoStatus, transaction) {
  if (!Object.keys(TRANSICOES_VALIDAS).includes(novoStatus)) {
    throw erro(`Status inválido: ${novoStatus}.`, 400);
  }

  async function aplicar(t) {
    const edicao = await EventEdition.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!edicao) throw erro("Edição não encontrada.", 404);
    if (!transicaoValida(edicao.status, novoStatus)) {
      throw erro(`Transição inválida: ${edicao.status} → ${novoStatus}.`, 409, "LIFECYCLE_INVALIDO");
    }
    edicao.status = novoStatus;
    try {
      await edicao.save({ transaction: t });
    } catch (e) {
      if (e.name === "SequelizeUniqueConstraintError") {
        throw erro(
          "Essa definição já tem uma edição ATIVA — encerre ou cancele antes de ativar outra.",
          409,
        );
      }
      throw e;
    }
    return edicao;
  }

  if (transaction) return aplicar(transaction);
  return sequelize.transaction(aplicar);
}

async function listarPorDefinicao(idEventDefinition) {
  return EventEdition.findAll({
    where: { id_event_definition: idEventDefinition },
    order: [["id", "DESC"]],
  });
}

async function obterPorId(id, transaction) {
  const edicao = await EventEdition.findByPk(id, { transaction });
  if (!edicao) throw erro("Edição não encontrada.", 404);
  return edicao;
}

// Edições publicamente visíveis — só ACTIVE, de definições PUBLISHED.
// Listagem pública mínima (seção 11 da encomenda): sem metadata
// administrativo.
async function listarAtivasPublicas() {
  const EventDefinition = require("../models/eventPuzzleModels").EventDefinition;
  const edicoes = await EventEdition.findAll({
    where: { status: "ACTIVE" },
    include: [{ model: EventDefinition, as: "definicao", where: { status: "PUBLISHED" } }],
    order: [["id", "DESC"]],
  });
  return edicoes.map((e) => ({
    id: e.id,
    key: e.key,
    nome: e.nome,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    definicao: { id: e.definicao.id, key: e.definicao.key, nome: e.definicao.nome },
  }));
}

function dtoAdmin(edicao) {
  return {
    id: edicao.id,
    id_event_definition: edicao.id_event_definition,
    key: edicao.key,
    nome: edicao.nome,
    status: edicao.status,
    starts_at: edicao.starts_at,
    ends_at: edicao.ends_at,
    metadata: edicao.metadata,
    createdAt: edicao.createdAt,
    updatedAt: edicao.updatedAt,
  };
}

module.exports = {
  TRANSICOES_VALIDAS,
  transicaoValida,
  criar,
  transicionar,
  listarPorDefinicao,
  obterPorId,
  listarAtivasPublicas,
  dtoAdmin,
};
