// Evento "O Coração da Máquina Celestial" — Fase 1. EventDefinition é
// o template/conceito PERMANENTE do evento (nunca uma execução
// concreta — isso é EventEdition). Lifecycle próprio, nunca
// compartilhado com os outros 4 domínios (Fase 0 revisada, item 1 da
// encomenda de Fase 1).
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const { EventDefinition, EventEdition } = require("../models/eventPuzzleModels");

function erro(mensagem, statusCode = 400, code) {
  return Object.assign(new Error(mensagem), { statusCode, code });
}

// DRAFT → PUBLISHED → ARCHIVED, ou DRAFT → ARCHIVED (abandonar antes de
// publicar). Nenhuma transição de volta; ARCHIVED é terminal.
const TRANSICOES_VALIDAS = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: [],
};

function transicaoValida(atual, novo) {
  return TRANSICOES_VALIDAS[atual]?.includes(novo) ?? false;
}

// Nenhum controller deve setar `status` arbitrariamente — essa é a
// ÚNICA porta de entrada pra mudar o lifecycle de uma EventDefinition.
//
// Hardening item 5 (mesmo princípio aplicado a criarNovaVersao): o
// invariante é do PRÓPRIO service, não de quem chama — sem abrir (ou
// reaproveitar) uma transaction real aqui, o lock abaixo seria inerte
// e o check de "sem edição ACTIVE/SCHEDULED" (item 3) seria só
// cosmético, nunca uma garantia real contra corrida.
async function transicionar(id, novoStatus, transaction) {
  if (!Object.keys(TRANSICOES_VALIDAS).includes(novoStatus)) {
    throw erro(`Status inválido: ${novoStatus}.`, 400);
  }

  async function aplicar(t) {
    const definicao = await EventDefinition.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!definicao) throw erro("Evento não encontrado.", 404);
    if (!transicaoValida(definicao.status, novoStatus)) {
      throw erro(
        `Transição inválida: ${definicao.status} → ${novoStatus}.`,
        409,
        "LIFECYCLE_INVALIDO",
      );
    }

    // Hardening item 3: nunca arquivar com EventEdition ACTIVE ou
    // SCHEDULED pendente — exige encerrar/cancelar antes. A linha do
    // Definition já está travada acima (FOR UPDATE); qualquer
    // eventEditionService.transicionar(..., "ACTIVE") concorrente
    // também trava essa MESMA linha antes de checar PUBLISHED (ver
    // eventEditionService.js), então as duas serializam de verdade uma
    // contra a outra — nunca as duas decisões lendo o mesmo estado
    // "stale" ao mesmo tempo.
    if (novoStatus === "ARCHIVED") {
      const edicaoPendente = await EventEdition.findOne({
        where: { id_event_definition: id, status: { [Op.in]: ["ACTIVE", "SCHEDULED"] } },
        transaction: t,
      });
      if (edicaoPendente) {
        throw erro(
          "Encerre ou cancele as edições ACTIVE/SCHEDULED antes de arquivar o evento.",
          409,
          "EDICOES_PENDENTES",
        );
      }
    }

    definicao.status = novoStatus;
    await definicao.save({ transaction: t });
    return definicao;
  }

  if (transaction) return aplicar(transaction);
  return sequelize.transaction(aplicar);
}

async function criar({ key, nome, descricao, metadata } = {}, transaction) {
  if (typeof key !== "string" || !/^[a-z0-9-]{3,60}$/.test(key)) {
    throw erro("Key inválida — use só letras minúsculas, números e hífen (3-60 caracteres).", 400);
  }
  if (typeof nome !== "string" || nome.trim().length < 3 || nome.length > 160) {
    throw erro("Nome inválido.", 400);
  }
  return EventDefinition.create(
    { key, nome: nome.trim(), descricao: descricao ?? null, metadata: metadata ?? null },
    { transaction },
  );
}

async function listar() {
  return EventDefinition.findAll({ order: [["id", "DESC"]] });
}

// `{ lock: true }` só tem efeito com uma `transaction` real — usado
// pelos checks de lifecycle cruzado (hardening item 2) que precisam
// serializar contra um ARCHIVE concorrente (ver eventEditionService.
// transicionar e puzzleBlueprintService.transicionar).
async function obterPorId(id, transaction, { lock } = {}) {
  const definicao = await EventDefinition.findByPk(id, {
    transaction,
    lock: lock && transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!definicao) throw erro("Evento não encontrado.", 404);
  return definicao;
}

// DTO Admin — único consumidor é o painel administrativo
// (event_puzzle.view/manage). Nunca exposto a jogador.
function dtoAdmin(definicao) {
  return {
    id: definicao.id,
    key: definicao.key,
    nome: definicao.nome,
    descricao: definicao.descricao,
    status: definicao.status,
    metadata: definicao.metadata,
    createdAt: definicao.createdAt,
    updatedAt: definicao.updatedAt,
  };
}

module.exports = {
  TRANSICOES_VALIDAS,
  transicaoValida,
  transicionar,
  criar,
  listar,
  obterPorId,
  dtoAdmin,
};
