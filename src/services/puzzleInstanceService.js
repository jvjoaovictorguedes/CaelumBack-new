// Evento "O Coração da Máquina Celestial" — Fase 1. PuzzleInstance é a
// execução concreta de uma PuzzleBlueprintVersion por um personagem/
// grupo; PuzzleParticipant é o vínculo. Nenhuma lógica de puzzle real
// (engrenagem/espelho/válvula) — isso é Fase 2+. Este service só prepara
// a fundação de estado/lifecycle/concorrência.
//
// CONCORRÊNCIA (correção explícita da encomenda de Fase 1):
// `actionGuardService.exclusive()` é process-local/in-memory — NUNCA é
// suficiente com múltiplas réplicas, então nenhuma mutação de
// PuzzleInstance depende dele como garantia. A garantia real é o UPDATE
// condicional `WHERE id=:id AND state_version=:expectedVersion` em
// `aplicarMutacao` — se 0 linhas forem afetadas, foi conflito (ação
// baseada em estado antigo), nunca aplicado parcialmente.
// `actionGuardService.assertVersion()` continua reaproveitado como
// validação RÁPIDA em memória (mesmo padrão de combatController.js:694
// e fishingService.js:384) — só pra devolver um 409 educado sem nem
// tentar o UPDATE quando já dá pra saber que está staleado; nunca
// substitui a garantia atômica do banco.
const crypto = require("crypto");
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const {
  EventEdition,
  PuzzleBlueprint,
  PuzzleBlueprintVersion,
  PuzzleInstance,
  PuzzleParticipant,
} = require("../models/eventPuzzleModels");
const puzzleBlueprintService = require("./puzzleBlueprintService");
const { assertVersion } = require("../antiAutomation/actionGuardService");

function erro(mensagem, statusCode = 400, code) {
  return Object.assign(new Error(mensagem), { statusCode, code });
}

// CREATED → ACTIVE → COMPLETED|FAILED|ABANDONED|EXPIRED. CREATED e
// ACTIVE também alcançam ABANDONED/EXPIRED direto (nunca chegou a
// progredir, ou ficou parado demais). Nenhuma transição de volta; os 4
// terminais nunca mudam de novo.
const TRANSICOES_VALIDAS = {
  CREATED: ["ACTIVE", "ABANDONED", "EXPIRED"],
  ACTIVE: ["COMPLETED", "FAILED", "ABANDONED", "EXPIRED"],
  COMPLETED: [],
  FAILED: [],
  ABANDONED: [],
  EXPIRED: [],
};
const TERMINAIS = new Set(["COMPLETED", "FAILED", "ABANDONED", "EXPIRED"]);

function transicaoValida(atual, novo) {
  return TRANSICOES_VALIDAS[atual]?.includes(novo) ?? false;
}

// Gerado só no servidor — nunca aceito do cliente (seção 12 da
// encomenda: "jogador não pode escolher seed").
function gerarSeed() {
  return crypto.randomBytes(32).toString("hex");
}

// Idempotência (seção 13 da encomenda): se o personagem já tem uma
// PuzzleInstance CREATED/ACTIVE desse blueprint (qualquer versão)
// dentro dessa edição, devolve ela em vez de criar outra. Essa
// transaction+lock é a garantia real contra corrida — NÃO existe
// índice parcial cross-table pra isso (exigiria desnormalizar
// id_blueprint em puzzle_participants só pra esse propósito; ver
// relatório de entrega pro trade-off documentado).
async function criarOuObterInstancia(idEventEdition, idBlueprint, personagem, transaction) {
  async function processar(t) {
    const edicao = await EventEdition.findByPk(idEventEdition, { transaction: t });
    if (!edicao) throw erro("Edição não encontrada.", 404);
    if (edicao.status !== "ACTIVE") throw erro("Essa edição não está ativa.", 409);

    const blueprint = await PuzzleBlueprint.findByPk(idBlueprint, { transaction: t });
    if (!blueprint) throw erro("Blueprint não encontrado.", 404);
    if (blueprint.id_event_definition !== edicao.id_event_definition) {
      throw erro("Esse blueprint não pertence ao evento dessa edição.", 400);
    }

    const existente = await PuzzleParticipant.findOne({
      where: { id_personagem: personagem.id },
      include: [
        {
          model: PuzzleInstance,
          as: "instancia",
          where: { id_event_edition: idEventEdition, status: { [Op.in]: ["CREATED", "ACTIVE"] } },
          include: [
            {
              model: PuzzleBlueprintVersion,
              as: "blueprintVersion",
              where: { id_blueprint: idBlueprint },
            },
          ],
        },
      ],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (existente) return { instancia: existente.instancia, criada: false };

    const versao = await puzzleBlueprintService.obterUltimaPublicada(idBlueprint, t);

    const instancia = await PuzzleInstance.create(
      {
        id_event_edition: idEventEdition,
        id_blueprint_version: versao.id,
        seed: gerarSeed(),
        state: {},
      },
      { transaction: t },
    );

    // Mesma transaction do create da instância — nunca uma instância
    // sem nenhum participante (prova de rollback composto, seção 17 da
    // encomenda: qualquer falha aqui desfaz a instância também).
    await PuzzleParticipant.create(
      {
        id_instance: instancia.id,
        id_personagem: personagem.id,
        personagem_nome_snapshot: personagem.nome,
        role: "SOLO",
      },
      { transaction: t },
    );

    return { instancia, criada: true };
  }

  if (transaction) return processar(transaction);
  return sequelize.transaction(processar);
}

// Ownership (seção 12 da encomenda): nunca confiar num id enviado pelo
// cliente pra identidade — personagemId sempre vem de
// req.personagemAtual.id. Lança 404 (não 403) pra não confirmar pra um
// atacante que a instância existe mas é de outra pessoa.
async function obterParaPersonagem(idInstance, idPersonagem) {
  const participante = await PuzzleParticipant.findOne({
    where: { id_instance: idInstance, id_personagem: idPersonagem },
    include: [{ model: PuzzleInstance, as: "instancia" }],
  });
  if (!participante) throw erro("Instância não encontrada.", 404);
  return participante.instancia;
}

// ÚNICA porta de entrada pra mutação de estado/status de uma
// PuzzleInstance — nunca um controller setando `state`/`status`/
// `state_version` direto. A garantia real contra concorrência é o
// UPDATE condicional abaixo; tudo antes dele é só validação de forma
// (nunca uma garantia).
async function aplicarMutacao(idInstance, expectedVersion, { novoStatus, novoState } = {}) {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw erro("expectedVersion inválido.", 400);
  }

  const atual = await PuzzleInstance.findByPk(idInstance);
  if (!atual) throw erro("Instância não encontrada.", 404);

  // Validação RÁPIDA em memória (reaproveita actionGuardService, nunca
  // substitui o UPDATE condicional abaixo) — devolve 409 educado sem
  // gastar um round-trip de UPDATE quando já dá pra saber que está
  // staleado pela leitura que acabamos de fazer.
  try {
    assertVersion(expectedVersion, atual.state_version);
  } catch {
    throw erro("Versão de estado desatualizada — sincronize e tente de novo.", 409, "CONFLITO_VERSAO");
  }

  if (novoStatus !== undefined) {
    if (!Object.keys(TRANSICOES_VALIDAS).includes(novoStatus)) {
      throw erro(`Status inválido: ${novoStatus}.`, 400);
    }
    if (!transicaoValida(atual.status, novoStatus)) {
      throw erro(`Transição inválida: ${atual.status} → ${novoStatus}.`, 409, "LIFECYCLE_INVALIDO");
    }
  }

  const camposNovos = { state_version: sequelize.literal("state_version + 1") };
  if (novoState !== undefined) camposNovos.state = novoState;
  if (novoStatus !== undefined) {
    camposNovos.status = novoStatus;
    if (novoStatus === "ACTIVE" && !atual.started_at) camposNovos.started_at = new Date();
    if (TERMINAIS.has(novoStatus)) camposNovos.completed_at = new Date();
  }

  // GARANTIA REAL — atômica no Postgres via UPDATE condicional, nunca
  // em memória/processo. Exige TANTO state_version quanto status
  // ainda baterem com o que foi lido (defesa extra contra uma
  // transição de status concorrente que não mudou state_version por
  // algum motivo). Se 0 linhas forem afetadas: ação baseada em estado
  // antigo → 409 → cliente ressincroniza. Duas chamadas concorrentes
  // com o MESMO expectedVersion nunca vencem as duas: a segunda sempre
  // vê o state_version já incrementado pela primeira e não bate mais.
  const where = { id: idInstance, state_version: expectedVersion };
  if (novoStatus !== undefined) where.status = atual.status;

  const [linhasAfetadas] = await PuzzleInstance.update(camposNovos, { where });
  if (linhasAfetadas === 0) {
    throw erro(
      "O estado da instância mudou — releia o estado atual e tente de novo.",
      409,
      "CONFLITO_VERSAO",
    );
  }
  return PuzzleInstance.findByPk(idInstance);
}

// DTO de Runtime — convenção reservada: só o subárvore `state.public`
// sai aqui. Qualquer outra chave em `state` (ou em
// blueprintVersion.config) é só-servidor e nunca atravessa esta função
// (seção 9/17 da encomenda: "DTO público não vaza segredo").
function dtoRuntime(instancia) {
  const state = instancia.state || {};
  return {
    id: instancia.id,
    status: instancia.status,
    state_version: instancia.state_version,
    state: state.public ?? {},
    started_at: instancia.started_at,
    completed_at: instancia.completed_at,
  };
}

module.exports = {
  TRANSICOES_VALIDAS,
  transicaoValida,
  gerarSeed,
  criarOuObterInstancia,
  obterParaPersonagem,
  aplicarMutacao,
  dtoRuntime,
};
