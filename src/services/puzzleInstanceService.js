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
//
// CONCORRÊNCIA NA CRIAÇÃO (hardening pós-Fase-1): `SELECT ... FOR UPDATE`
// NUNCA bloqueia uma linha que ainda não existe — travar
// PuzzleParticipant/PuzzleInstance antes de criá-los não serializa nada,
// porque não há linha nenhuma pra travar na primeira chamada. Duas
// transactions concorrentes podiam as duas "não encontrar" e as duas
// criarem uma Instance+Participant cada, violando o invariante "1
// instância ativa por personagem+blueprint+edição" sem nunca tocar a
// UNIQUE (id_instance, id_personagem) — os id_instance são diferentes.
// A correção real é travar uma linha ESTÁVEL que SEMPRE existe pro
// personagem (o próprio Character) ANTES de procurar/decidir — ver
// `criarOuObterInstancia`.
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
const Character = require("../models/Character");
const eventDefinitionService = require("./eventDefinitionService");
const puzzleBlueprintService = require("./puzzleBlueprintService");
const { assertVersion } = require("../antiAutomation/actionGuardService");

function erro(mensagem, statusCode = 400, code) {
  return Object.assign(new Error(mensagem), { statusCode, code });
}

// Mesmo raciocínio de MAX_CONFIG_BYTES (puzzleBlueprintService) — state é
// produzido tanto pelo cliente (via futuros endpoints de mutação) quanto
// internamente pelo próprio servidor, então o limite HTTP de 100kb do
// Express NÃO é suficiente por si só (hardening item 4).
const MAX_STATE_BYTES = 65536; // 64KB

function validarState(novoState) {
  if (novoState === null || typeof novoState !== "object" || Array.isArray(novoState)) {
    throw erro("state precisa ser um objeto JSON (nunca array na raiz).", 400);
  }
  const serializado = JSON.stringify(novoState);
  if (Buffer.byteLength(serializado, "utf8") > MAX_STATE_BYTES) {
    throw erro(`state não pode passar de ${MAX_STATE_BYTES} bytes serializado.`, 400);
  }
  return novoState;
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
// dentro dessa edição, devolve ela em vez de criar outra. NÃO existe
// índice parcial cross-table pra isso (exigiria desnormalizar
// id_blueprint em puzzle_participants só pra esse propósito; ver
// relatório de entrega pro trade-off documentado).
async function criarOuObterInstancia(idEventEdition, idBlueprint, personagem, transaction) {
  async function processar(t) {
    const edicao = await EventEdition.findByPk(idEventEdition, { transaction: t });
    if (!edicao) throw erro("Edição não encontrada.", 404);
    if (edicao.status !== "ACTIVE") throw erro("Essa edição não está ativa.", 409);

    // Hardening item 2: nunca confiar só na listagem pública
    // (listarAtivasPublicas) pra segurança — reconfirma aqui, no
    // momento exato da criação, que o evento-pai ainda está PUBLISHED
    // (pode ter sido arquivado depois da edição ter sido ativada).
    const definicao = await eventDefinitionService.obterPorId(edicao.id_event_definition, t);
    if (definicao.status !== "PUBLISHED") {
      throw erro("O evento dessa edição não está publicado.", 409, "EVENTO_NAO_PUBLICADO");
    }

    const blueprint = await PuzzleBlueprint.findByPk(idBlueprint, { transaction: t });
    if (!blueprint) throw erro("Blueprint não encontrado.", 404);
    if (blueprint.id_event_definition !== edicao.id_event_definition) {
      throw erro("Esse blueprint não pertence ao evento dessa edição.", 400);
    }

    // obterUltimaPublicada já filtra status=PUBLISHED — a versão
    // selecionada nunca é outra coisa (hardening item 2).
    const versaoPublicada = await puzzleBlueprintService.obterUltimaPublicada(idBlueprint, t);

    // GARANTIA REAL DE EXCLUSÃO MÚTUA (hardening item 1): travar
    // PuzzleParticipant/PuzzleInstance não serializa nada quando nenhuma
    // linha ainda existe (SELECT FOR UPDATE não bloqueia linha
    // inexistente). A linha ESTÁVEL que SEMPRE existe pro personagem é
    // o próprio Character — travamos ela antes de procurar/decidir, o
    // que serializa qualquer concorrência pro MESMO personagem (2
    // réplicas/transactions concorrentes pro mesmo personagem nunca
    // passam da linha abaixo ao mesmo tempo). actionGuardService.
    // exclusive() nunca seria suficiente aqui — é process-local.
    const personagemTravado = await Character.findByPk(personagem.id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!personagemTravado) throw erro("Personagem não encontrado.", 404);

    // SÓ DEPOIS do lock procuramos uma instância existente — qualquer
    // outra transaction concorrente pro mesmo personagem já está
    // bloqueada na linha do Character acima, então não existe mais
    // corrida possível daqui em diante.
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
    });
    if (existente) return { instancia: existente.instancia, criada: false };

    const instancia = await PuzzleInstance.create(
      {
        id_event_edition: idEventEdition,
        id_blueprint_version: versaoPublicada.id,
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

  // Hardening item 4: validação de FORMA pura, antes de qualquer round-
  // trip de banco — state é produzido tanto pelo cliente quanto pelo
  // próprio servidor (engine futuro), então o limite HTTP de 100kb do
  // Express não é garantia suficiente por si só.
  const estadoValidado = novoState !== undefined ? validarState(novoState) : undefined;

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
  if (estadoValidado !== undefined) camposNovos.state = estadoValidado;
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
  MAX_STATE_BYTES,
  transicaoValida,
  gerarSeed,
  criarOuObterInstancia,
  obterParaPersonagem,
  aplicarMutacao,
  dtoRuntime,
};
