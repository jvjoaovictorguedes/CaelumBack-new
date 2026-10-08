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

async function criarBlueprint(idEventDefinition, { key, nome, descricao } = {}, transaction) {
  await eventDefinitionService.obterPorId(idEventDefinition, transaction);
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
      { transaction },
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
    { transaction },
  );
  return { blueprint, versao };
}

// Nova revisão — version = MAX(version) + 1 pro blueprint, sempre
// DRAFT. Nunca reaproveita um número de versão já usado, mesmo que a
// versão anterior tenha sido arquivada sem nunca ter sido publicada.
async function criarNovaVersao(idBlueprint, { config } = {}, transaction) {
  const blueprint = await PuzzleBlueprint.findByPk(idBlueprint, { transaction });
  if (!blueprint) throw erro("Blueprint não encontrado.", 404);

  const ultima = await PuzzleBlueprintVersion.findOne({
    where: { id_blueprint: idBlueprint },
    order: [["version", "DESC"]],
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });
  const proximaVersao = (ultima?.version ?? 0) + 1;

  return PuzzleBlueprintVersion.create(
    { id_blueprint: idBlueprint, version: proximaVersao, config: validarConfig(config) },
    { transaction },
  );
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
    const versao = await PuzzleBlueprintVersion.findByPk(idVersion, { transaction: t, lock: t.LOCK.UPDATE });
    if (!versao) throw erro("Revisão não encontrada.", 404);
    if (!transicaoValida(versao.status, novoStatus)) {
      throw erro(`Transição inválida: ${versao.status} → ${novoStatus}.`, 409, "LIFECYCLE_INVALIDO");
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
