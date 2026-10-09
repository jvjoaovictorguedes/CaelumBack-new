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
const engine = require("./puzzleEngineCore");
const { resolverContexto } = require("./puzzleDomainRegistry");
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
//
// Hardening 1.2 (itens 4/5/6) — esta função é o ponto que mais precisa
// de locks reais, porque a decisão "pode criar uma Instance" depende de
// TRÊS entidades de lifecycle independente ao mesmo tempo
// (EventDefinition PUBLISHED, EventEdition ACTIVE, BlueprintVersion
// PUBLISHED), cada uma podendo mudar por uma transaction concorrente
// enquanto esta decide. Toda a cadeia de locks segue a ordem central
// documentada em eventDefinitionService.js: Definition → Edition →
// Blueprint → Version → Character. Os IDs usados pra escolher CADA
// lock vêm sempre de leituras NÃO travadas anteriores (FKs são
// imutáveis, nunca mudam depois de criadas — só o `status` de cada
// entidade muda, e é exatamente esse campo que cada lock protege).
async function criarOuObterInstancia(idEventEdition, idBlueprint, personagem, transaction) {
  async function processar(t) {
    const edicaoPreview = await EventEdition.findByPk(idEventEdition, { transaction: t });
    if (!edicaoPreview) throw erro("Edição não encontrada.", 404);

    // LOCK 1 (ordem: Definition) — fecha o item 5 da encomenda: nunca
    // basta LER o status e continuar; precisa travar a mesma linha que
    // eventDefinitionService.transicionar(ARCHIVED) trava, pra
    // serializar de verdade contra um ARCHIVE concorrente.
    const definicao = await eventDefinitionService.obterPorId(edicaoPreview.id_event_definition, t, {
      lock: true,
    });
    if (definicao.status !== "PUBLISHED") {
      throw erro("O evento dessa edição não está publicado.", 409, "EVENTO_NAO_PUBLICADO");
    }

    // LOCK 2 (ordem: Edition, depois de Definition) — fecha o item 4 da
    // encomenda, o TOCTOU mais importante: sem travar a MESMA linha que
    // eventEditionService.transicionar(ENDED/CANCELLED) trava, uma
    // transaction concorrente podia encerrar/cancelar a edição enquanto
    // esta continuava com a leitura antiga de ACTIVE. Com o lock, o
    // resultado concorrente é sempre um dos dois permitidos: OU a
    // criação da Instance vence primeiro (e a Edition só termina
    // depois, já com a Instance existindo), OU o END/CANCEL vence
    // primeiro (e esta chamada recebe o erro abaixo, baseada no status
    // fresco pós-lock — nunca os dois ao mesmo tempo com leitura stale).
    const edicao = await EventEdition.findByPk(idEventEdition, { transaction: t, lock: t.LOCK.UPDATE });
    if (!edicao) throw erro("Edição não encontrada.", 404);
    if (edicao.status !== "ACTIVE") throw erro("Essa edição não está ativa.", 409);

    const blueprintPreview = await PuzzleBlueprint.findByPk(idBlueprint, { transaction: t });
    if (!blueprintPreview) throw erro("Blueprint não encontrado.", 404);
    if (blueprintPreview.id_event_definition !== edicao.id_event_definition) {
      throw erro("Esse blueprint não pertence ao evento dessa edição.", 400);
    }

    // LOCK 3 (ordem: Blueprint, depois de Edition) — a mesma linha
    // estável que puzzleBlueprintService.criarNovaVersao e
    // .transicionar (ARCHIVED de uma version) travam. É isso que fecha
    // o item 6: enquanto esta transaction segura o lock do Blueprint,
    // NENHUMA outra consegue arquivar nenhuma version desse blueprint
    // (transicionar trava o MESMO Blueprint antes de tocar a Version) —
    // então a leitura abaixo de "última version PUBLISHED", mesmo sem
    // lock própria na Version, é segura: ninguém pode mudar o status de
    // nenhuma version deste blueprint enquanto não soltarmos este lock.
    const blueprint = await PuzzleBlueprint.findByPk(idBlueprint, { transaction: t, lock: t.LOCK.UPDATE });
    if (!blueprint) throw erro("Blueprint não encontrado.", 404);

    // obterUltimaPublicada já filtra status=PUBLISHED — combinado com o
    // LOCK 3 acima, a versão selecionada nunca pode ser arquivada por
    // baixo dos nossos pés entre esta leitura e o INSERT da Instance.
    // Instances JÁ EXISTENTES continuam normalmente apontando pra
    // versões arquivadas depois — isso é histórico correto; a garantia
    // aqui é só sobre Instances NOVAS (hardening 1.2, item 6).
    const versaoPublicada = await puzzleBlueprintService.obterUltimaPublicada(idBlueprint, t);

    // LOCK 4 (ordem: Character, sempre por último — nunca participa da
    // cadeia Definition/Edition/Blueprint/Version por FK, é uma garantia
    // de exclusão mútua independente). GARANTIA REAL (hardening 1.1,
    // item 1): travar PuzzleParticipant/PuzzleInstance não serializa
    // nada quando nenhuma linha ainda existe (SELECT FOR UPDATE não
    // bloqueia linha inexistente). A linha ESTÁVEL que SEMPRE existe
    // pro personagem é o próprio Character — travamos ela antes de
    // procurar/decidir, o que serializa qualquer concorrência pro
    // MESMO personagem. actionGuardService.exclusive() nunca seria
    // suficiente aqui — é process-local.
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

    // Fase 8: quando o config já declara `dominio` (mecânico/óptico/
    // hidráulico/convergência — Fase 3/5/6/7), o state inicial nasce
    // como o engine da Fase 2 realmente produziria pra esse config+seed
    // — nunca `{}` esperando a primeira ação pra inicializar.
    // `resolverContexto` também valida topologia/registry aqui, então
    // um Blueprint com config malformado nunca consegue nascer uma
    // Instance (falha cedo, na criação, não na primeira ação de um
    // jogador real). Configs SEM `dominio` (placeholders anteriores à
    // Fase 8 — ex.: os usados pelos testes de lifecycle puro da Fase 1,
    // que nunca pretenderam rodar engine nenhum) continuam caindo no
    // `state: {}` de sempre — nunca quebram, só não ganham engine.
    const seed = gerarSeed();
    const estadoInicial = versaoPublicada.config?.dominio
      ? engine.construirEstadoInicial(resolverContexto(versaoPublicada.config, seed))
      : {};

    const instancia = await PuzzleInstance.create(
      {
        id_event_edition: idEventEdition,
        id_blueprint_version: versaoPublicada.id,
        seed,
        state: estadoInicial,
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
async function obterParaPersonagem(idInstance, idPersonagem, { comBlueprint = false } = {}) {
  const includeInstancia = { model: PuzzleInstance, as: "instancia" };
  if (comBlueprint) {
    includeInstancia.include = [{ model: PuzzleBlueprintVersion, as: "blueprintVersion" }];
  }
  const participante = await PuzzleParticipant.findOne({
    where: { id_instance: idInstance, id_personagem: idPersonagem },
    include: [includeInstancia],
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

// Usado por puzzleActionService (Fase 8) pra decidir se uma ação acaba
// de RESOLVER o puzzle inteiro — nunca aceita isso do cliente (seção
// 7 da encomenda: "nunca aceitar completed=true/success=true"), só
// confere se TODOS os objectives declarados no config já estão na
// lista (sticky) de objetivosConcluidos que o próprio engine calculou.
// Puzzle sem nenhum objective declarado nunca "completa" sozinho —
// alguém (Admin/Blueprint) precisa ter definido pelo menos um.
function todosObjetivosConcluidos(config, estado) {
  const objetivos = config?.objectives ?? [];
  if (objetivos.length === 0) return false;
  const concluidos = new Set(estado.objetivosConcluidos ?? []);
  return objetivos.every((o) => concluidos.has(o.id));
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
  todosObjetivosConcluidos,
  dtoRuntime,
};
