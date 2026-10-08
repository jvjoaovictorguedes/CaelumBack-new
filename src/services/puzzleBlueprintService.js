// Evento "O Coração da Máquina Celestial" — Fase 1. PuzzleBlueprint é a
// identidade LÓGICA de um puzzle; PuzzleBlueprintVersion é a revisão
// IMUTÁVEL publicada (versionamento: identidade + revisão, Fase 0
// revisada item 2). PuzzleInstance sempre referencia a VERSION exata —
// editar um draft depois de publicado NUNCA muda uma instância já
// criada, porque a instância nunca aponta pra "versão atual".
const { sequelize } = require("../config/database");
const { PuzzleBlueprint, PuzzleBlueprintVersion } = require("../models/eventPuzzleModels");
const eventDefinitionService = require("./eventDefinitionService");

function erro(mensagem, statusCode = 400, code) {
  return Object.assign(new Error(mensagem), { statusCode, code });
}

// Guarda de tamanho em app-level — Postgres não tem um jeito prático de
// CHECK em tamanho de JSONB (Fase 0 revisada, correção de concorrência
// não é a única coisa documentada aqui; isto é a decisão da seção 3 da
// encomenda de Fase 1 — "defina limites claros pro JSONB").
const MAX_CONFIG_BYTES = 65536; // 64KB

function validarConfig(config) {
  if (config === undefined || config === null) return {};
  if (typeof config !== "object" || Array.isArray(config)) {
    throw erro("config precisa ser um objeto JSON.", 400);
  }
  const serializado = JSON.stringify(config);
  if (Buffer.byteLength(serializado, "utf8") > MAX_CONFIG_BYTES) {
    throw erro(`config não pode passar de ${MAX_CONFIG_BYTES} bytes serializado.`, 400);
  }
  return config;
}

// DRAFT → PUBLISHED → ARCHIVED, ou DRAFT → ARCHIVED (abandonar sem
// publicar). PUBLISHED é IMUTÁVEL: nenhuma transição de volta, e
// `config` só pode mudar enquanto DRAFT (ver atualizarDraft).
const TRANSICOES_VALIDAS = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: [],
};

function transicaoValida(atual, novo) {
  return TRANSICOES_VALIDAS[atual]?.includes(novo) ?? false;
}

// Hardening 1.2, item 2: mesmo princípio de eventEditionService.criar —
// sem transaction própria + lock real na EventDefinition, existia a
// mesma corrida (T1 lê PUBLISHED sem lock → T2 arquiva e comita → T1
// cria o blueprint mesmo assim). Preserva o invariante já existente
// (nunca um PuzzleBlueprint sem sua version 1, por falha parcial) —
// os dois creates continuam na MESMA transaction.
async function criarBlueprint(idEventDefinition, { key, nome, descricao } = {}, transaction) {
  async function aplicar(t) {
    // LOCK 1 (ordem do domínio: Definition) — ver comentário central em
    // eventDefinitionService.js.
    const definicao = await eventDefinitionService.obterPorId(idEventDefinition, t, { lock: true });
    if (definicao.status === "ARCHIVED") {
      throw erro("Esse evento foi arquivado — não é possível criar novos blueprints.", 409);
    }
    if (typeof key !== "string" || !/^[a-z0-9-]{3,60}$/.test(key)) {
      throw erro("Key inválida — use só letras minúsculas, números e hífen (3-60 caracteres).", 400);
    }
    if (typeof nome !== "string" || nome.trim().length < 3 || nome.length > 160) {
      throw erro("Nome inválido.", 400);
    }
    let blueprint;
    try {
      blueprint = await PuzzleBlueprint.create(
        { id_event_definition: idEventDefinition, key, nome: nome.trim(), descricao: descricao ?? null },
        { transaction: t },
      );
    } catch (e) {
      if (e.name === "SequelizeUniqueConstraintError") {
        throw erro("Já existe um blueprint com essa key pra esse evento.", 409);
      }
      throw e;
    }
    // Primeira revisão nasce junto, sempre DRAFT, version=1 — nunca um
    // blueprint sem nenhuma versão pra editar.
    const versao = await PuzzleBlueprintVersion.create(
      { id_blueprint: blueprint.id, version: 1, config: {} },
      { transaction: t },
    );
    return { blueprint, versao };
  }

  if (transaction) return aplicar(transaction);
  return sequelize.transaction(aplicar);
}

// Nova revisão — version = MAX(version) + 1 pro blueprint, sempre
// DRAFT. Nunca reaproveita um número de versão já usado, mesmo que a
// versão anterior tenha sido arquivada sem nunca ter sido publicada.
//
// Hardening item 5: o invariante "nunca colide, sempre monotônico" é do
// PRÓPRIO service — nunca depende de quem chama fornecer uma
// transaction pro LOCK.UPDATE ser efetivo. Sem transaction nenhuma, o
// lock antigo (`transaction?.LOCK?.UPDATE`) resolvia pra `undefined` e
// não travava NADA.
//
// A trava certa NÃO é a linha de MAX(version): `SELECT ... FOR UPDATE
// ORDER BY version DESC LIMIT 1` trava a linha que ERA a última no
// momento da leitura, mas se outra transaction concorrente SUBIU uma
// versão nova enquanto esta esperava o lock, o Postgres não reavalia o
// ORDER BY/LIMIT depois de desbloquear (EvalPlanQual só reage a UPDATE/
// DELETE na própria linha travada, nunca a um INSERT novo) — a segunda
// transaction calcularia a MESMA "próxima versão" já usada pela
// primeira e colidiria na UNIQUE (id_blueprint, version) com um 500
// inesperado em vez de uma versão monotônica limpa.
//
// A linha ESTÁVEL que SEMPRE existe pro mesmo blueprint é o PRÓPRIO
// PuzzleBlueprint — travamos ela antes de ler/calcular a próxima
// versão, serializando qualquer concorrência pro MESMO blueprint (mesmo
// raciocínio do lock no Character em puzzleInstanceService.
// criarOuObterInstancia).
async function criarNovaVersao(idBlueprint, { config } = {}, transaction) {
  async function aplicar(t) {
    // Leitura NÃO travada só pra descobrir id_event_definition (FK
    // imutável) — os locks de verdade vêm na ordem do domínio.
    const blueprintPreview = await PuzzleBlueprint.findByPk(idBlueprint, { transaction: t });
    if (!blueprintPreview) throw erro("Blueprint não encontrado.", 404);

    // LOCK 1 (ordem: Definition, antes de Blueprint). Hardening 1.2,
    // item 3: antes este lock vinha DEPOIS do lock do Blueprint (ordem
    // invertida em relação ao resto do domínio) — permitia a corrida
    // "T1 lock Blueprint → T1 lê Definition=PUBLISHED sem lock → T2
    // lock Definition e ARCHIVE → T1 cria versão nova mesmo assim".
    const definicao = await eventDefinitionService.obterPorId(blueprintPreview.id_event_definition, t, {
      lock: true,
    });
    if (definicao.status === "ARCHIVED") {
      throw erro("Esse evento foi arquivado — não é possível criar novas revisões.", 409);
    }

    // LOCK 2 (ordem: Blueprint, depois de Definition) — trava a linha
    // ESTÁVEL do Blueprint (sempre existe) antes de calcular a próxima
    // versão; mesmo raciocínio do hardening 1.1 (SELECT FOR UPDATE +
    // ORDER BY + LIMIT no MAX(version) não reage a um INSERT
    // concorrente novo). Esse mesmo lock também é o ponto de
    // serialização que puzzleInstanceService.criarOuObterInstancia usa
    // pra nunca escolher uma version que está sendo arquivada ao mesmo
    // tempo (hardening 1.2, item 6).
    const blueprint = await PuzzleBlueprint.findByPk(idBlueprint, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!blueprint) throw erro("Blueprint não encontrado.", 404);

    const ultima = await PuzzleBlueprintVersion.findOne({
      where: { id_blueprint: idBlueprint },
      order: [["version", "DESC"]],
      transaction: t,
    });
    const proximaVersao = (ultima?.version ?? 0) + 1;

    return PuzzleBlueprintVersion.create(
      { id_blueprint: idBlueprint, version: proximaVersao, config: validarConfig(config) },
      { transaction: t },
    );
  }

  if (transaction) return aplicar(transaction);
  return sequelize.transaction(aplicar);
}

// Editar `config` só é permitido enquanto DRAFT — essa é a garantia de
// imutabilidade pós-publicação (nenhum trigger de banco; invariante de
// service, testado explicitamente).
async function atualizarDraft(idVersion, { config, nome } = {}, transaction) {
  const versao = await PuzzleBlueprintVersion.findByPk(idVersion, {
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });
  if (!versao) throw erro("Revisão não encontrada.", 404);
  if (versao.status !== "DRAFT") {
    throw erro("Só é possível editar uma revisão em DRAFT — publicada é imutável.", 409, "DRAFT_IMUTAVEL");
  }
  if (config !== undefined) versao.config = validarConfig(config);
  await versao.save({ transaction });
  return versao;
}

async function transicionar(idVersion, novoStatus, { idAdmin } = {}, transaction) {
  if (!Object.keys(TRANSICOES_VALIDAS).includes(novoStatus)) {
    throw erro(`Status inválido: ${novoStatus}.`, 400);
  }

  async function aplicar(t) {
    // Leitura NÃO travada só pra descobrir a hierarquia (id_blueprint é
    // FK imutável) — os locks de verdade vêm na ordem do domínio:
    // Definition → Blueprint → Version.
    const versaoPreview = await PuzzleBlueprintVersion.findByPk(idVersion, { transaction: t });
    if (!versaoPreview) throw erro("Revisão não encontrada.", 404);

    // LOCK 1 (ordem: Definition) — só quando o destino é PUBLISHED, que
    // é o único caso que depende do status da EventDefinition. Carrega
    // Version → Blueprint → EventDefinition e confirma PUBLISHED antes
    // de publicar a revisão; `{ lock: true }` trava a mesma linha que
    // eventEditionService.transicionar usa pra ACTIVE, serializando de
    // verdade contra um ARCHIVE concorrente (hardening 1.1, item 2).
    let definicao = null;
    if (novoStatus === "PUBLISHED") {
      const blueprintPreview = await PuzzleBlueprint.findByPk(versaoPreview.id_blueprint, { transaction: t });
      if (!blueprintPreview) throw erro("Blueprint não encontrado.", 404);
      definicao = await eventDefinitionService.obterPorId(blueprintPreview.id_event_definition, t, {
        lock: true,
      });
    }

    // LOCK 2 (ordem: Blueprint, depois de Definition, antes de Version)
    // — travado SEMPRE (não só pra PUBLISHED). Hardening 1.2, item 6:
    // é essa linha estável do Blueprint que serializa este ARCHIVE
    // contra puzzleInstanceService.criarOuObterInstancia, que também
    // trava o Blueprint antes de escolher a última version PUBLISHED —
    // uma Instance nova nunca nasce apontando pra uma version que
    // venceu a corrida pra ARCHIVED, porque as duas decisões nunca
    // rodam ao mesmo tempo pro MESMO blueprint.
    const blueprint = await PuzzleBlueprint.findByPk(versaoPreview.id_blueprint, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!blueprint) throw erro("Blueprint não encontrado.", 404);

    // LOCK 3 (ordem: Version, por último) — a própria revisão sendo
    // transicionada.
    const versao = await PuzzleBlueprintVersion.findByPk(idVersion, { transaction: t, lock: t.LOCK.UPDATE });
    if (!versao) throw erro("Revisão não encontrada.", 404);
    if (!transicaoValida(versao.status, novoStatus)) {
      throw erro(`Transição inválida: ${versao.status} → ${novoStatus}.`, 409, "LIFECYCLE_INVALIDO");
    }

    if (novoStatus === "PUBLISHED" && definicao.status !== "PUBLISHED") {
      throw erro("Só é possível publicar uma revisão de um evento PUBLISHED.", 409, "EVENTO_NAO_PUBLICADO");
    }

    versao.status = novoStatus;
    if (novoStatus === "PUBLISHED") {
      versao.published_at = new Date();
      versao.published_by_admin_id = idAdmin ?? null;
    }
    await versao.save({ transaction: t });
    return versao;
  }

  if (transaction) return aplicar(transaction);
  return sequelize.transaction(aplicar);
}

async function listarPorEventDefinition(idEventDefinition) {
  return PuzzleBlueprint.findAll({
    where: { id_event_definition: idEventDefinition },
    order: [["id", "DESC"]],
  });
}

async function listarVersoes(idBlueprint) {
  return PuzzleBlueprintVersion.findAll({
    where: { id_blueprint: idBlueprint },
    order: [["version", "DESC"]],
  });
}

async function obterVersaoPorId(idVersion, transaction) {
  const versao = await PuzzleBlueprintVersion.findByPk(idVersion, { transaction });
  if (!versao) throw erro("Revisão não encontrada.", 404);
  return versao;
}

// Pra resolver "a versão publicada mais recente deste blueprint" na
// hora de criar uma PuzzleInstance nova — nunca "a versão atual"
// (conceito que não existe aqui de propósito).
async function obterUltimaPublicada(idBlueprint, transaction) {
  const versao = await PuzzleBlueprintVersion.findOne({
    where: { id_blueprint: idBlueprint, status: "PUBLISHED" },
    order: [["version", "DESC"]],
    transaction,
  });
  if (!versao) throw erro("Esse blueprint não tem nenhuma revisão publicada.", 409);
  return versao;
}

// DTO Admin — full, inclui `config` cru (pode ter golden_solution etc).
// Único consumidor é o painel administrativo.
function dtoAdminVersao(versao) {
  return {
    id: versao.id,
    id_blueprint: versao.id_blueprint,
    version: versao.version,
    status: versao.status,
    config: versao.config,
    published_at: versao.published_at,
    published_by_admin_id: versao.published_by_admin_id,
    createdAt: versao.createdAt,
    updatedAt: versao.updatedAt,
  };
}

// DTO Público — nunca o `config` cru. Só os campos EXPLICITAMENTE
// curados pra exibição pública (convenção: config.titulo_publico/
// descricao_publica/dificuldade) — qualquer outra chave de config
// (golden_solution, regras de validação privadas, etc.) nunca sai
// daqui, mesmo que exista na coluna. Nenhum puzzle real existe ainda
// nesta fase, então isto é só a convenção/contrato — testado
// explicitamente (seção 17 da encomenda: "DTO público não vaza
// segredo").
function dtoPublicoVersao(versao, blueprint) {
  const config = versao.config || {};
  return {
    id_blueprint: blueprint.id,
    key: blueprint.key,
    nome: blueprint.nome,
    titulo_publico: typeof config.titulo_publico === "string" ? config.titulo_publico : blueprint.nome,
    descricao_publica: typeof config.descricao_publica === "string" ? config.descricao_publica : null,
    dificuldade: typeof config.dificuldade === "string" ? config.dificuldade : null,
  };
}

module.exports = {
  MAX_CONFIG_BYTES,
  TRANSICOES_VALIDAS,
  transicaoValida,
  criarBlueprint,
  criarNovaVersao,
  atualizarDraft,
  transicionar,
  listarPorEventDefinition,
  listarVersoes,
  obterVersaoPorId,
  obterUltimaPublicada,
  dtoAdminVersao,
  dtoPublicoVersao,
};
