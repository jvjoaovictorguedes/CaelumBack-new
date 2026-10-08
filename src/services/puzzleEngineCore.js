// Evento "O Coração da Máquina Celestial" — Fase 2 (Puzzle Engine
// Determinístico). Núcleo PURO do engine de puzzles: nenhum require de
// express/socket.io/sequelize/models/React aqui, de propósito — quem
// chama (puzzleInstanceService, Fase 8) é responsável por toda a parte
// de transporte/persistência/autorização. Este arquivo só sabe
// transformar (config, state, action) -> novo state + feedback,
// sempre da mesma forma pro mesmo input (determinismo é o requisito
// central da encomenda).
//
// CONCEITOS (JSDoc só documentação — projeto é JS puro, não TS):
//
// @typedef {Object} PuzzleComponent
// @property {string} id       - único dentro do config, nunca mudado após publicação
// @property {string} type     - key registrada no registry (ver puzzleComponentRegistry.js)
// @property {Object} [props]  - dados puros (number/string/boolean/array/objeto literal);
//                                NUNCA function, NUNCA string destinada a interpretação dinâmica de código/SQL
//
// @typedef {Object} PuzzleConnection
// @property {string} id
// @property {{componentId: string, port: string}} from
// @property {{componentId: string, port: string}} to
//
// @typedef {Object} PuzzleCondition - avaliada por avaliarCondicao(), nunca por eval
// @property {string} op - um de OPERADORES_DE_CONDICAO (ver abaixo)
// @property {string} [path]  - caminho dot-notation dentro do PuzzleState (ex.: "components.gearA.ligado")
// @property {*} [value]
// @property {PuzzleCondition[]} [conditions] - operandos de AND/OR
// @property {PuzzleCondition} [condition]    - operando de NOT
//
// @typedef {Object} PuzzleObjective
// @property {string} id
// @property {string} [descricao]
// @property {PuzzleCondition} condicao
//
// @typedef {Object} PuzzleAction - o que o cliente manda (já autenticado/roteado pela Fase 8)
// @property {string} type           - nome da ação (ex.: "ROTATE", "TOGGLE", "SET_VALVE")
// @property {string} [componentId]  - componente alvo; ausente = ação "global" (sem efeito em componente nenhum, só reavalia condições)
// @property {Object} [payload]      - dados puros da ação
//
// @typedef {Object} PuzzleState - o que fica em PuzzleInstance.state (JSONB)
// @property {Object<string,*>} components      - estado runtime por componentId (opaco pro engine, do tipo)
// @property {number} rngContador                - avança 1 por ação executada; parte do determinismo (seed+contador)
// @property {string[]} objetivosConcluidos       - sticky: uma vez concluído, nunca "desconclui"
// @property {Object} public                      - ÚNICO subárvore exposto em DTO de runtime (convenção já usada em puzzleInstanceService.dtoRuntime)
//
// @typedef {Object} PuzzleSimulationContext
// @property {Object} config    - BlueprintVersion.config inteiro (imutável durante a simulação)
// @property {string} seed      - PuzzleInstance.seed
// @property {Object} registry  - criado por puzzleComponentRegistry.criarRegistryDeComponentes()
//
// @typedef {Object} PuzzleResult - retorno de executarAcao()
// @property {PuzzleState} state
// @property {Object[]} eventos
// @property {Object} feedbackPublico
// @property {string[]} condicoesAtingidas
// @property {string[]} objetivosRecemConcluidos
//
// GARANTIA DE SEGURANÇA (requisito explícito da encomenda): este arquivo
// nunca interpreta código dinamicamente (sem eval, sem construtor de
// function em runtime, sem módulo vm), nem monta SQL a
// partir de dado do Admin/cliente. PuzzleCondition é dado puro
// interpretado por um switch fixo (OPERADORES_DE_CONDICAO) — adicionar
// um operador novo exige editar este arquivo e fazer deploy, nunca é
// possível "inventar" um operador novo só configurando o Admin.
const crypto = require("crypto");

function erro(mensagem, statusCode = 400, code) {
  return Object.assign(new Error(mensagem), { statusCode, code });
}

// ---------------------------------------------------------------------------
// RNG determinístico (seed + contador) — nunca Math.random() em nada que
// precise ser reproduzível. hash32 (FNV-1a) deriva uma semente numérica
// estável a partir de `${seed}:${contador}`; mulberry32 é um PRNG simples,
// rápido e determinístico o bastante pra variação visual/mecânica de
// puzzle (não é criptografia — a imprevisibilidade "real" do evento vem
// só do `seed` de 32 bytes gerado por crypto.randomBytes em
// puzzleInstanceService.gerarSeed, nunca exposto ao cliente).
function hash32(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(semente) {
  let a = semente >>> 0;
  return function gerar() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Mesmo (seed, contador) produz sempre a MESMA sequência de chamadas de
// proximoFloat/proximoInt dentro de uma execução de reduzir() — é isso
// que permite "variação determinística": dois engines independentes
// simulando a mesma sequência de ações a partir do mesmo seed chegam no
// MESMO state final, sem nenhuma coordenação entre si.
function criarRng(seed, contador) {
  if (typeof seed !== "string" || !seed) throw erro("seed precisa ser uma string não vazia.");
  if (!Number.isInteger(contador) || contador < 0) throw erro("contador de rng inválido.");
  const gerar = mulberry32(hash32(`${seed}:${contador}`));
  return {
    proximoFloat() {
      return gerar();
    },
    proximoInt(max) {
      if (!Number.isInteger(max) || max <= 0) throw erro("proximoInt precisa de max inteiro positivo.");
      return Math.floor(gerar() * max);
    },
  };
}

// ---------------------------------------------------------------------------
// Validação de config declarativo (BlueprintVersion.config).
function validarConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw erro("config precisa ser um objeto.");
  }
  if (!Array.isArray(config.components)) {
    throw erro("config.components precisa ser um array.");
  }
  const ids = new Set();
  for (const comp of config.components) {
    if (!comp || typeof comp.id !== "string" || !comp.id) {
      throw erro("Todo componente precisa de id (string não vazia).");
    }
    if (ids.has(comp.id)) throw erro(`Componente duplicado no config: ${comp.id}.`);
    ids.add(comp.id);
    if (typeof comp.type !== "string" || !comp.type) {
      throw erro(`Componente '${comp.id}' precisa de type (string não vazia).`);
    }
    if (comp.props !== undefined && (typeof comp.props !== "object" || comp.props === null || Array.isArray(comp.props))) {
      throw erro(`Componente '${comp.id}': props precisa ser objeto.`);
    }
  }
  if (config.connections !== undefined) {
    if (!Array.isArray(config.connections)) throw erro("config.connections precisa ser array.");
    for (const conn of config.connections) {
      const origem = conn?.from?.componentId;
      const destino = conn?.to?.componentId;
      if (!origem || !ids.has(origem)) throw erro(`Conexão referencia componente de origem inexistente: ${origem}.`);
      if (!destino || !ids.has(destino)) throw erro(`Conexão referencia componente de destino inexistente: ${destino}.`);
    }
  }
  if (config.objectives !== undefined) {
    if (!Array.isArray(config.objectives)) throw erro("config.objectives precisa ser array.");
    const idsObjetivos = new Set();
    for (const objetivo of config.objectives) {
      if (!objetivo || typeof objetivo.id !== "string" || !objetivo.id) {
        throw erro("Todo objetivo precisa de id (string não vazia).");
      }
      if (idsObjetivos.has(objetivo.id)) throw erro(`Objetivo duplicado no config: ${objetivo.id}.`);
      idsObjetivos.add(objetivo.id);
      if (!objetivo.condicao) throw erro(`Objetivo '${objetivo.id}' precisa de condicao.`);
    }
  }
  if (config.conditions !== undefined && !Array.isArray(config.conditions)) {
    throw erro("config.conditions precisa ser array.");
  }
  return config;
}

function validarRegistryContraConfig(config, registry) {
  for (const comp of config.components) {
    if (!registry.possui(comp.type)) {
      throw erro(`Tipo de componente '${comp.type}' (componente '${comp.id}') não está registrado neste registry.`, 400, "COMPONENTE_TIPO_DESCONHECIDO");
    }
    registry.obter(comp.type).validarProps(comp.props || {});
  }
}

// Helper exportado pros reducers de componente (Fase 3+) — nunca o
// engine em si interpreta semântica de conexão (direção/razão/etc, isso
// é decisão de cada domínio), só oferece "quem está ligado a mim".
function obterConexoesDoComponente(config, componentId, porta) {
  return (config.connections || []).filter((conn) => {
    const tocaOrigem = conn.from.componentId === componentId && (porta === undefined || conn.from.port === porta);
    const tocaDestino = conn.to.componentId === componentId && (porta === undefined || conn.to.port === porta);
    return tocaOrigem || tocaDestino;
  });
}

// ---------------------------------------------------------------------------
// Avaliador de condições declarativas — switch fixo, nunca interpretação dinâmica de código.
function obterPorCaminho(objeto, caminho) {
  if (typeof caminho !== "string" || !caminho) return undefined;
  return caminho.split(".").reduce((acc, parte) => (acc == null ? undefined : acc[parte]), objeto);
}

const OPERADORES_DE_CONDICAO = {
  EQUALS: (cond, estado) => obterPorCaminho(estado, cond.path) === cond.value,
  NOT_EQUALS: (cond, estado) => obterPorCaminho(estado, cond.path) !== cond.value,
  GT: (cond, estado) => Number(obterPorCaminho(estado, cond.path)) > Number(cond.value),
  GTE: (cond, estado) => Number(obterPorCaminho(estado, cond.path)) >= Number(cond.value),
  LT: (cond, estado) => Number(obterPorCaminho(estado, cond.path)) < Number(cond.value),
  LTE: (cond, estado) => Number(obterPorCaminho(estado, cond.path)) <= Number(cond.value),
  IN: (cond, estado) => Array.isArray(cond.value) && cond.value.includes(obterPorCaminho(estado, cond.path)),
  AND: (cond, estado) => Array.isArray(cond.conditions) && cond.conditions.every((c) => avaliarCondicao(c, estado)),
  OR: (cond, estado) => Array.isArray(cond.conditions) && cond.conditions.some((c) => avaliarCondicao(c, estado)),
  NOT: (cond, estado) => !avaliarCondicao(cond.condition, estado),
};

function avaliarCondicao(condicao, estado) {
  if (!condicao || typeof condicao.op !== "string") {
    throw erro("PuzzleCondition precisa de 'op' (string).");
  }
  const operador = OPERADORES_DE_CONDICAO[condicao.op];
  if (!operador) throw erro(`Operador de condição desconhecido: ${condicao.op}.`, 400, "OPERADOR_DESCONHECIDO");
  return !!operador(condicao, estado);
}

// Objetivos são STICKY por design: um puzzle não deve "desconcluir" um
// objetivo alcançado porque o jogador moveu uma peça de novo depois —
// isso puniria exploração/engano honesto do jogador. `concluidosAnteriores`
// vem de PuzzleState.objetivosConcluidos (persistido).
function avaliarObjetivos(objetivos, estado, concluidosAnteriores) {
  const conjunto = new Set(concluidosAnteriores || []);
  const novasConclusoes = [];
  for (const objetivo of objetivos || []) {
    if (conjunto.has(objetivo.id)) continue;
    if (avaliarCondicao(objetivo.condicao, estado)) {
      conjunto.add(objetivo.id);
      novasConclusoes.push(objetivo.id);
    }
  }
  return { objetivosConcluidos: Array.from(conjunto), novasConclusoes };
}

// Condições de nível de config.conditions (não-objetivo, não-sticky) —
// feedback informativo recalculado a cada ação (ex.: "painel aceso",
// "pressão crítica"); quem precisa de progresso permanente usa Objective.
function avaliarCondicoesDeclaradas(condicoes, estado) {
  const atingidas = [];
  for (const condicao of condicoes || []) {
    if (avaliarCondicao(condicao.condicao || condicao, estado)) {
      atingidas.push(condicao.id ?? null);
    }
  }
  return atingidas.filter((id) => id !== null);
}

// ---------------------------------------------------------------------------
// Construção do PuzzleState inicial a partir do config — chamado uma vez
// na criação da PuzzleInstance (puzzleInstanceService, Fase 8).
function construirEstadoInicial(contexto) {
  const { config, registry } = contexto;
  validarConfig(config);
  validarRegistryContraConfig(config, registry);
  const components = {};
  for (const comp of config.components) {
    const tipo = registry.obter(comp.type);
    components[comp.id] = tipo.criarEstado(comp.props || {});
  }
  const estadoBase = { components, rngContador: 0, objetivosConcluidos: [], public: {} };
  const { objetivosConcluidos } = avaliarObjetivos(config.objectives, estadoBase, []);
  return { ...estadoBase, objetivosConcluidos, public: construirFeedbackPublico(config, registry, estadoBase) };
}

function validarAcao(config, registry, action) {
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    throw erro("Ação inválida — precisa ser um objeto.");
  }
  if (typeof action.type !== "string" || !action.type) {
    throw erro("Ação precisa de 'type' (string não vazia).");
  }
  if (action.payload !== undefined && (typeof action.payload !== "object" || action.payload === null || Array.isArray(action.payload))) {
    throw erro("payload da ação precisa ser objeto.");
  }
  if (action.componentId !== undefined) {
    if (typeof action.componentId !== "string" || !action.componentId) {
      throw erro("componentId da ação precisa ser string não vazia.");
    }
    const comp = config.components.find((c) => c.id === action.componentId);
    if (!comp) throw erro(`Ação referencia componente inexistente: ${action.componentId}.`, 400, "COMPONENTE_INEXISTENTE");
    registry.obter(comp.type); // 400 se o tipo não existir neste registry
  }
}

function construirFeedbackPublico(config, registry, estado) {
  const components = {};
  for (const comp of config.components) {
    const tipo = registry.obter(comp.type);
    components[comp.id] = tipo.feedbackPublico(estado.components[comp.id], comp.props || {});
  }
  return { components, objetivosConcluidos: estado.objetivosConcluidos };
}

// Ponto de entrada principal: (contexto, state atual, action validada
// externamente) -> PuzzleResult. Determinístico: mesmo (config, seed,
// state, action) SEMPRE produz o mesmo PuzzleResult — não há leitura de
// relógio, Math.random() ou I/O aqui.
function executarAcao(contexto, state, action) {
  const { config, seed, registry } = contexto;
  if (!state || typeof state !== "object") throw erro("state inválido.");
  validarAcao(config, registry, action);

  const eventos = [];
  let novosComponentes = state.components;

  if (action.componentId) {
    const comp = config.components.find((c) => c.id === action.componentId);
    const tipo = registry.obter(comp.type);
    const estadoAtualDoComponente = state.components[action.componentId] ?? tipo.criarEstado(comp.props || {});
    const rng = criarRng(seed, state.rngContador);
    const resultado = tipo.reduzir({
      props: comp.props || {},
      state: estadoAtualDoComponente,
      action,
      rng,
      config,
      estadoGlobal: state,
    });
    if (!resultado || typeof resultado !== "object" || !("state" in resultado)) {
      throw erro(`reduzir() do tipo '${comp.type}' precisa devolver { state, events? }.`);
    }
    novosComponentes = { ...state.components, [action.componentId]: resultado.state };
    if (Array.isArray(resultado.events)) {
      for (const evento of resultado.events) {
        eventos.push({ ...evento, componentId: action.componentId });
      }
    }
  }

  const estadoIntermediario = {
    ...state,
    components: novosComponentes,
    rngContador: state.rngContador + 1,
  };

  const { objetivosConcluidos, novasConclusoes } = avaliarObjetivos(
    config.objectives,
    estadoIntermediario,
    state.objetivosConcluidos,
  );
  const condicoesAtingidas = avaliarCondicoesDeclaradas(config.conditions, estadoIntermediario);
  const comObjetivos = { ...estadoIntermediario, objetivosConcluidos };
  const feedbackPublico = construirFeedbackPublico(config, registry, comObjetivos);

  const novoState = { ...comObjetivos, public: feedbackPublico };

  for (const idObjetivo of novasConclusoes) {
    eventos.push({ tipo: "OBJETIVO_CONCLUIDO", objetivoId: idObjetivo });
  }

  return {
    state: novoState,
    eventos,
    feedbackPublico,
    condicoesAtingidas,
    objetivosRecemConcluidos: novasConclusoes,
  };
}

// Assinatura estável de um config — usada pelo validador de
// solvabilidade do Admin (Fase 15) pra detectar se um config mudou
// desde a última simulação sem precisar comparar o JSON inteiro.
function assinarConfig(config) {
  return crypto.createHash("sha256").update(JSON.stringify(config)).digest("hex");
}

module.exports = {
  criarRng,
  validarConfig,
  validarRegistryContraConfig,
  validarAcao,
  obterConexoesDoComponente,
  obterPorCaminho,
  avaliarCondicao,
  avaliarObjetivos,
  avaliarCondicoesDeclaradas,
  construirEstadoInicial,
  construirFeedbackPublico,
  executarAcao,
  assinarConfig,
  OPERADORES_DE_CONDICAO,
};
