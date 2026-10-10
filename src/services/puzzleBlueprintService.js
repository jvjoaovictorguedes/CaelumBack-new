// Evento "O Coração da Máquina Celestial" — Fase 1. PuzzleBlueprint é a
// identidade LÓGICA de um puzzle; PuzzleBlueprintVersion é a revisão
// IMUTÁVEL publicada (versionamento: identidade + revisão, Fase 0
// revisada item 2). PuzzleInstance sempre referencia a VERSION exata —
// editar um draft depois de publicado NUNCA muda uma instância já
// criada, porque a instância nunca aponta pra "versão atual".
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const { PuzzleBlueprint, PuzzleBlueprintVersion, PuzzleInstance, PuzzleParticipant } = require("../models/eventPuzzleModels");
const eventDefinitionService = require("./eventDefinitionService");
const engine = require("./puzzleEngineCore");
const { resolverContexto } = require("./puzzleDomainRegistry");

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
async function criarBlueprint(idEventDefinition, { key, nome, descricao, ordem, id_blueprint_prerequisito } = {}, transaction) {
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
    // Fase 12 — pré-requisito, quando informado, precisa pertencer ao
    // MESMO evento (nunca uma corrente entre eventos diferentes).
    if (id_blueprint_prerequisito != null) {
      const prerequisito = await PuzzleBlueprint.findByPk(id_blueprint_prerequisito, { transaction: t });
      if (!prerequisito || prerequisito.id_event_definition !== Number(idEventDefinition)) {
        throw erro("id_blueprint_prerequisito precisa ser um blueprint existente do mesmo evento.", 400);
      }
    }
    let blueprint;
    try {
      blueprint = await PuzzleBlueprint.create(
        {
          id_event_definition: idEventDefinition,
          key,
          nome: nome.trim(),
          descricao: descricao ?? null,
          ordem: Number.isInteger(ordem) ? ordem : 0,
          id_blueprint_prerequisito: id_blueprint_prerequisito ?? null,
        },
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

// Fase 15 — editar nome/descrição/ordem/pré-requisito da IDENTIDADE
// (nunca o `config`, que é por Version e só edita via atualizarDraft).
// Mesma ordem de locks de criarBlueprint (Definition → Blueprint) —
// reordenar/trocar pré-requisito é uma mudança estrutural equivalente
// a criar, nunca menos protegida contra concorrência com um ARCHIVE.
async function atualizarBlueprint(idBlueprint, { nome, descricao, ordem, id_blueprint_prerequisito } = {}, transaction) {
  async function aplicar(t) {
    const blueprintPreview = await PuzzleBlueprint.findByPk(idBlueprint, { transaction: t });
    if (!blueprintPreview) throw erro("Blueprint não encontrado.", 404);

    const definicao = await eventDefinitionService.obterPorId(blueprintPreview.id_event_definition, t, { lock: true });
    if (definicao.status === "ARCHIVED") {
      throw erro("Esse evento foi arquivado — não é possível editar blueprints.", 409);
    }

    const blueprint = await PuzzleBlueprint.findByPk(idBlueprint, { transaction: t, lock: t.LOCK.UPDATE });
    if (!blueprint) throw erro("Blueprint não encontrado.", 404);

    if (nome !== undefined) {
      if (typeof nome !== "string" || nome.trim().length < 3 || nome.length > 160) {
        throw erro("Nome inválido.", 400);
      }
      blueprint.nome = nome.trim();
    }
    if (descricao !== undefined) blueprint.descricao = descricao;
    if (ordem !== undefined) {
      if (!Number.isInteger(ordem)) throw erro("ordem precisa ser um inteiro.", 400);
      blueprint.ordem = ordem;
    }
    if (id_blueprint_prerequisito !== undefined) {
      if (id_blueprint_prerequisito === null) {
        blueprint.id_blueprint_prerequisito = null;
      } else {
        if (Number(id_blueprint_prerequisito) === blueprint.id) {
          throw erro("Um blueprint não pode ser pré-requisito de si mesmo.", 400);
        }
        const prerequisito = await PuzzleBlueprint.findByPk(id_blueprint_prerequisito, { transaction: t });
        if (!prerequisito || prerequisito.id_event_definition !== blueprint.id_event_definition) {
          throw erro("id_blueprint_prerequisito precisa ser um blueprint existente do mesmo evento.", 400);
        }
        blueprint.id_blueprint_prerequisito = prerequisito.id;
      }
    }
    await blueprint.save({ transaction: t });
    return blueprint;
  }

  if (transaction) return aplicar(transaction);
  return sequelize.transaction(aplicar);
}

// Fase 15 — validador de solvabilidade. NUNCA um solver automático
// (nenhum motor genérico de busca aqui): o Admin submete uma sequência
// de ações candidata (a golden solution que ele pretende) e esta
// função simula exatamente o que puzzleActionService.executarAcao
// faria pro jogador, passo a passo, a partir de um estado FRESCO —
// reportando o ponto exato de falha (resolução de domínio inválida,
// estrutura/topologia inválida, ou uma ação específica da sequência
// que não faz o esperado) em vez de só "sim/não". Só grava
// solvability_signature/validated_at quando a sequência realmente
// resolve TODOS os objetivos — nunca numa falha parcial.
async function validarSolvabilidade(idVersion, { acoes } = {}, transaction) {
  const versao = await obterVersaoPorId(idVersion, transaction);
  if (!Array.isArray(acoes) || acoes.length === 0) {
    throw erro("Informe `acoes` — a sequência candidata a simular (nunca vazia).", 400);
  }

  const config = versao.config || {};

  let contexto;
  try {
    contexto = resolverContexto(config, "admin-dry-run-fase15");
  } catch (e) {
    return { valido: false, etapa: "DOMINIO", erro: e.message };
  }

  let estado;
  try {
    estado = engine.construirEstadoInicial(contexto);
  } catch (e) {
    return { valido: false, etapa: "ESTRUTURA_OU_TOPOLOGIA", erro: e.message };
  }

  const trace = [];
  for (let indice = 0; indice < acoes.length; indice++) {
    try {
      const resultado = engine.executarAcao(contexto, estado, acoes[indice]);
      estado = resultado.state;
      trace.push({ indice, acao: acoes[indice], eventos: resultado.eventos });
    } catch (e) {
      return { valido: false, etapa: "SIMULACAO", indiceFalha: indice, acao: acoes[indice], erro: e.message, trace };
    }
  }

  // Require tardio pra nunca fechar um ciclo de módulo —
  // puzzleInstanceService.js já requer este arquivo (ver
  // obterUltimaPublicada/personagemCompletouBlueprint), então um
  // require no topo deste arquivo apontando de volta pra lá quebraria
  // a ordem de carregamento do primeiro `require` que rodar.
  const { todosObjetivosConcluidos } = require("./puzzleInstanceService");
  const resolvido = todosObjetivosConcluidos(config, estado);

  if (!resolvido) {
    return { valido: false, etapa: "OBJETIVOS_INCOMPLETOS", trace, objetivosConcluidos: estado.objetivosConcluidos };
  }

  const assinatura = engine.assinarConfig(config);
  versao.solvability_signature = assinatura;
  versao.solvability_validated_at = new Date();
  await versao.save({ transaction });

  return { valido: true, assinatura, trace, objetivosConcluidos: estado.objetivosConcluidos };
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
    solvability_signature: versao.solvability_signature,
    solvability_validated_at: versao.solvability_validated_at,
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

// DTO Público de LAYOUT (Fase 12) — o jogador precisa ver a topologia
// pra poder jogar (componentes, conexões, posição de layout), mas NUNCA
// a `condicao` de um objective (isso é a fórmula, não o enunciado) nem
// qualquer chave fora do allowlist abaixo. Diferente de
// dtoPublicoVersao (metadados de listagem): isto é o que a cena
// (MechanicalPuzzleScene/OpticalPuzzleScene/HydraulicPuzzleScene,
// frontend) recebe pra desenhar e deixar o jogador agir.
function dtoPublicoLayout(versao) {
  const config = versao.config || {};
  return {
    dominio: typeof config.dominio === "string" ? config.dominio : null,
    components: Array.isArray(config.components)
      ? config.components.map((c) => ({ id: c.id, type: c.type, props: c.props ?? {}, position: c.position ?? null }))
      : [],
    connections: Array.isArray(config.connections)
      ? config.connections.map((c) => ({ id: c.id, from: c.from, to: c.to }))
      : [],
    objectives: Array.isArray(config.objectives)
      ? config.objectives.map((o) => ({ id: o.id, descricao: o.descricao ?? null }))
      : [],
  };
}

// Fase 12 — true se `personagem` já tem uma PuzzleInstance COMPLETED
// desse blueprint (qualquer version) dentro dessa edição. Usado só pra
// decidir `bloqueado` na listagem pública — nunca pra decidir sozinho
// se uma Instance pode nascer (isso é enforcement real em
// puzzleInstanceService.criarOuObterInstancia, que roda sob os MESMOS
// locks do domínio; esta função aqui é só leitura pra listagem).
async function personagemCompletouBlueprint(idPersonagem, idEventEdition, idBlueprint, transaction) {
  const participante = await PuzzleParticipant.findOne({
    where: { id_personagem: idPersonagem },
    include: [
      {
        model: PuzzleInstance,
        as: "instancia",
        where: { id_event_edition: idEventEdition, status: "COMPLETED" },
        include: [
          { model: PuzzleBlueprintVersion, as: "blueprintVersion", where: { id_blueprint: idBlueprint } },
        ],
      },
    ],
    transaction,
  });
  return Boolean(participante);
}

// Listagem pública (Fase 12) — as salas de UMA edição, na ORDEM
// declarada, com `bloqueado` calculado pro personagem que está
// pedindo. Salas bloqueadas NUNCA mandam `layout` (mesmo princípio de
// puzzleClueService.obterCaderno pra pistas bloqueadas: omite o campo
// inteiro, não só mascara) — só título/descrição/dificuldade como
// teaser.
async function listarPublicosPorEdicao(idEventDefinition, idEventEdition, idPersonagem) {
  const blueprints = await PuzzleBlueprint.findAll({
    where: { id_event_definition: idEventDefinition },
    order: [["ordem", "ASC"], ["id", "ASC"]],
  });

  const resultado = [];
  for (const blueprint of blueprints) {
    const versao = await PuzzleBlueprintVersion.findOne({
      where: { id_blueprint: blueprint.id, status: "PUBLISHED" },
      order: [["version", "DESC"]],
    });
    if (!versao) continue; // sala ainda sem nenhuma revisão publicada — nunca aparece pro jogador.

    const bloqueado = blueprint.id_blueprint_prerequisito
      ? !(await personagemCompletouBlueprint(idPersonagem, idEventEdition, blueprint.id_blueprint_prerequisito))
      : false;

    const base = dtoPublicoVersao(versao, blueprint);
    resultado.push({
      ...base,
      ordem: blueprint.ordem,
      bloqueado,
      ...(bloqueado ? {} : { layout: dtoPublicoLayout(versao) }),
    });
  }
  return resultado;
}

module.exports = {
  MAX_CONFIG_BYTES,
  TRANSICOES_VALIDAS,
  transicaoValida,
  criarBlueprint,
  atualizarBlueprint,
  criarNovaVersao,
  atualizarDraft,
  transicionar,
  validarSolvabilidade,
  listarPorEventDefinition,
  listarVersoes,
  obterVersaoPorId,
  obterUltimaPublicada,
  dtoAdminVersao,
  dtoPublicoVersao,
  dtoPublicoLayout,
  listarPublicosPorEdicao,
  personagemCompletouBlueprint,
};
