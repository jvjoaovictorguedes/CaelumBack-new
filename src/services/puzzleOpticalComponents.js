// Evento "O Coração da Máquina Celestial" — Fase 5 (Óptica).
// Componentes reutilizáveis de luz: LightEmitter, Mirror, Prism, Lens,
// Shutter, Receiver. Mesmo padrão arquitetural da Fase 3
// (puzzleMechanicalComponents.js): registry declarativo sobre o
// engine da Fase 2 + um hook `posProcessarComponentes` que recalcula o
// grafo inteiro a partir da topologia a cada ação.
//
// REGRA DE DESIGN (mesmo critério pedagógico da Fase 3 — nunca física
// real, sempre regras simples e explicáveis):
//   - Um feixe tem só DOIS atributos: `intensidade` (número) e `cor`
//     (um canal fixo: BRANCO/VERMELHO/VERDE/AZUL, nunca mistura livre).
//   - MIRROR e SHUTTER só passam o feixe adiante (1:1) ou cortam
//     (0/null) — nunca mudam cor/intensidade. MIRROR alterna via ação
//     GIRAR (refletindo/bloqueando); SHUTTER via ABRIR/FECHAR.
//   - LENS multiplica a intensidade recebida pelo seu próprio
//     `props.fator`, sempre, não importa o que vier antes — nunca
//     muda a cor.
//   - PRISM é o único componente com fan-out de verdade: cada conexão
//     que SAI de um Prism carrega uma `port` (ex.: "VERMELHO"). Se o
//     Prism recebeu BRANCO, TODAS as saídas emitem na cor da própria
//     port, na mesma intensidade recebida (luz branca "contém" todos
//     os canais). Se recebeu uma cor específica X, só a saída cuja
//     port === X deixa passar (mesma intensidade); as outras ficam em
//     0/null. Prism sem luz nenhuma incidindo = todas as saídas 0/null.
//
// Mesmo cuidado de determinismo/segurança da Fase 3: tudo recalculado
// do zero a cada ação (nunca incremental), nenhuma função de
// comportamento aceita string/JSON executável (ver
// puzzleComponentRegistry.validarDefinicao).
const { criarRegistryDeComponentes } = require("./puzzleComponentRegistry");
const { validarSemCiclos } = require("./puzzleEngineCore");

function erro(mensagem, statusCode = 400, code) {
  return Object.assign(new Error(mensagem), { statusCode, code });
}

const CANAIS = ["BRANCO", "VERMELHO", "VERDE", "AZUL"];
function validarCanal(valor, contexto) {
  if (!CANAIS.includes(valor)) throw erro(`${contexto}: cor precisa ser uma de ${CANAIS.join(", ")}.`);
}
function numeroPositivo(valor, contexto) {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0) {
    throw erro(`${contexto}: precisa ser um número positivo.`);
  }
}
function numeroNaoNegativo(valor, contexto) {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) {
    throw erro(`${contexto}: precisa ser um número >= 0.`);
  }
}

// Todos os tipos ópticos participam do grafo de propagação — diferente
// da Fase 3 (onde LEVER ficava de fora), aqui até o SHUTTER (controle
// manual) é um nó no caminho da luz, porque a luz literalmente passa
// por ele (ou não).
const TIPOS_OPTICOS = new Set(["EMITTER", "MIRROR", "PRISM", "LENS", "SHUTTER", "RECEIVER"]);

function feixeEmRepouso() {
  return { intensidade: 0, cor: null };
}

function validarTopologia(config) {
  return validarSemCiclos(config, TIPOS_OPTICOS, { codigoErro: "TOPOLOGIA_CICLO" });
}

// ---------------------------------------------------------------------------
// Propagação — mesmo esqueleto de BFS-com-pai da Fase 3 (nunca confundir
// "voltar pelo cabo que vim" com uma segunda fonte convergindo). A
// diferença central: a transformação de uma aresta que SAI de um PRISM
// depende da `port` daquela aresta específica (fan-out real), então
// `conexoesPorNo` aqui guarda a conexão inteira, não só o id do vizinho.
// MIRROR/SHUTTER checam o PRÓPRIO estado atual (refletindo/aberto, lido
// de `components` — o mapa ANTES do reset) pra decidir se cortam,
// sobrepondo o resultado de `transformar` pra 0/null quando fechados.
function propagarOptica({ config, components }) {
  const compPorId = new Map(config.components.map((c) => [c.id, c]));
  const novoMapa = { ...components };

  for (const comp of config.components) {
    if (TIPOS_OPTICOS.has(comp.type) && comp.type !== "EMITTER") {
      novoMapa[comp.id] = { ...novoMapa[comp.id], ...feixeEmRepouso() };
    }
  }

  const visitado = new Set();
  const fila = [];

  for (const comp of config.components) {
    if (comp.type !== "EMITTER") continue;
    const estadoAtual = components[comp.id] || {};
    const ligado = !!estadoAtual.ligado;
    const intensidade = ligado ? comp.props.intensidade : 0;
    const cor = ligado ? comp.props.cor : null;
    novoMapa[comp.id] = { ...estadoAtual, ligado, intensidade, cor };
    visitado.add(comp.id);
    fila.push({ id: comp.id, intensidade, cor, veioDe: null });
  }

  // Guarda a CONEXÃO inteira (não só o id do vizinho) pra poder ler a
  // `port` de qualquer aresta que saia de um PRISM.
  const conexoesPorNo = new Map();
  for (const conn of config.connections || []) {
    const a = conn.from.componentId;
    const b = conn.to.componentId;
    if (!TIPOS_OPTICOS.has(compPorId.get(a)?.type) || !TIPOS_OPTICOS.has(compPorId.get(b)?.type)) continue;
    if (!conexoesPorNo.has(a)) conexoesPorNo.set(a, []);
    if (!conexoesPorNo.has(b)) conexoesPorNo.set(b, []);
    conexoesPorNo.get(a).push({ vizinhoId: b, conexao: conn });
    conexoesPorNo.get(b).push({ vizinhoId: a, conexao: conn });
  }

  while (fila.length > 0) {
    const atual = fila.shift();
    const origemComp = compPorId.get(atual.id);
    for (const { vizinhoId, conexao } of conexoesPorNo.get(atual.id) || []) {
      if (vizinhoId === atual.veioDe) continue;
      if (visitado.has(vizinhoId)) {
        throw erro(
          `Topologia óptica inválida em runtime: '${vizinhoId}' recebe mais de uma fonte de luz (ciclo ou convergência).`,
          409,
          "TOPOLOGIA_CICLO",
        );
      }
      const destinoComp = compPorId.get(vizinhoId);
      // `porta` é a port do lado da conexão que sai de `atual.id` —
      // só importa quando atual.id é um PRISM (fan-out).
      const porta = conexao.from.componentId === atual.id ? conexao.from.port : conexao.to.port;
      let resultado = transformar(origemComp, destinoComp, atual, porta);
      resultado = aplicarBloqueioManual(destinoComp, components[vizinhoId], resultado);
      novoMapa[vizinhoId] = { ...novoMapa[vizinhoId], intensidade: resultado.intensidade, cor: resultado.cor };
      visitado.add(vizinhoId);
      fila.push({ id: vizinhoId, intensidade: resultado.intensidade, cor: resultado.cor, veioDe: atual.id });
    }
  }

  for (const comp of config.components) {
    if (comp.type !== "RECEIVER") continue;
    const estado = novoMapa[comp.id];
    novoMapa[comp.id] = { ...estado, atingido: receiverAtingido(comp.props, estado) };
  }

  return novoMapa;
}

function receiverAtingido(props, estado) {
  const dentroDaTolerancia = Math.abs(estado.intensidade - props.intensidadeAlvo) <= (props.toleranciaIntensidade ?? 0);
  const corCorreta = estado.cor === props.corAlvo;
  return dentroDaTolerancia && corCorreta;
}

// Regra central (documentada no cabeçalho): PRISM faz fan-out por
// port; LENS multiplica intensidade sempre; qualquer outro par é
// passagem 1:1 (MIRROR/SHUTTER sem bloqueio, RECEIVER só registra o
// que chegou). O corte de MIRROR/SHUTTER fechados é aplicado depois,
// em aplicarBloqueioManual — esta função nunca olha pro ESTADO do
// destino, só pro seu TIPO, pra não precisar saber onde `components`
// mora.
function transformar(origemComp, destinoComp, entrada, porta) {
  if (origemComp.type === "PRISM") {
    if (entrada.intensidade <= 0 || !entrada.cor) return feixeEmRepouso();
    if (entrada.cor === "BRANCO") return { intensidade: entrada.intensidade, cor: porta };
    if (entrada.cor === porta) return { intensidade: entrada.intensidade, cor: entrada.cor };
    return feixeEmRepouso();
  }
  if (destinoComp.type === "LENS") {
    return { intensidade: entrada.intensidade * destinoComp.props.fator, cor: entrada.cor };
  }
  return { intensidade: entrada.intensidade, cor: entrada.cor };
}

// MIRROR/SHUTTER precisam checar o PRÓPRIO estado atual (refletindo/
// aberto) pra decidir se cortam — diferente de LENS (sempre
// multiplica) e do caso genérico. `transformar` acima não tem acesso
// direto ao estado atual do destino, então a checagem real acontece
// aqui, ANTES de sobrescrever `novoMapa`, trocando o resultado pra
// 0/null quando o nó está fechado/não-refletindo.
function aplicarBloqueioManual(destinoComp, estadoAtualDestino, resultado) {
  if (destinoComp.type === "MIRROR" && estadoAtualDestino?.refletindo === false) return feixeEmRepouso();
  if (destinoComp.type === "SHUTTER" && estadoAtualDestino?.aberto === false) return feixeEmRepouso();
  return resultado;
}

// ---------------------------------------------------------------------------
function criarRegistryOptico() {
  const registry = criarRegistryDeComponentes();

  registry.registrar({
    key: "EMITTER",
    validarProps: (props) => {
      numeroPositivo(props.intensidade, "EMITTER.intensidade");
      validarCanal(props.cor, "EMITTER.cor");
    },
    criarEstado: () => ({ ligado: false, intensidade: 0, cor: null }),
    reduzir: ({ state, action, props }) => {
      if (action.type === "LIGAR") {
        return { state: { ...state, ligado: true, intensidade: props.intensidade, cor: props.cor }, events: [{ tipo: "EMISSOR_LIGADO" }] };
      }
      if (action.type === "DESLIGAR") {
        return { state: { ...state, ligado: false, intensidade: 0, cor: null }, events: [{ tipo: "EMISSOR_DESLIGADO" }] };
      }
      return { state, events: [] };
    },
    feedbackPublico: (state) => ({ ligado: state.ligado, intensidade: state.intensidade, cor: state.cor }),
  });

  registry.registrar({
    key: "MIRROR",
    criarEstado: () => ({ refletindo: true, intensidade: 0, cor: null }),
    reduzir: ({ state, action }) => {
      if (action.type !== "GIRAR") return { state, events: [] };
      const refletindo = !state.refletindo;
      return { state: { ...state, refletindo }, events: [{ tipo: "ESPELHO_GIRADO", refletindo }] };
    },
    feedbackPublico: (state) => ({ refletindo: state.refletindo, intensidade: state.intensidade, cor: state.cor }),
  });

  registry.registrar({
    key: "PRISM",
    criarEstado: () => feixeEmRepouso(),
    reduzir: ({ state }) => ({ state, events: [] }), // nunca acionado diretamente; só propagação
    feedbackPublico: (state) => ({ intensidade: state.intensidade, cor: state.cor }),
  });

  registry.registrar({
    key: "LENS",
    validarProps: (props) => numeroPositivo(props.fator, "LENS.fator"),
    criarEstado: () => feixeEmRepouso(),
    reduzir: ({ state }) => ({ state, events: [] }),
    feedbackPublico: (state, props) => ({ intensidade: state.intensidade, cor: state.cor, fator: props.fator }),
  });

  registry.registrar({
    key: "SHUTTER",
    criarEstado: () => ({ aberto: false, intensidade: 0, cor: null }),
    reduzir: ({ state, action }) => {
      if (action.type === "ABRIR") return { state: { ...state, aberto: true }, events: [{ tipo: "OBTURADOR_ABERTO" }] };
      if (action.type === "FECHAR") return { state: { ...state, aberto: false }, events: [{ tipo: "OBTURADOR_FECHADO" }] };
      return { state, events: [] };
    },
    feedbackPublico: (state) => ({ aberto: state.aberto, intensidade: state.intensidade, cor: state.cor }),
  });

  registry.registrar({
    key: "RECEIVER",
    validarProps: (props) => {
      validarCanal(props.corAlvo, "RECEIVER.corAlvo");
      numeroNaoNegativo(props.intensidadeAlvo, "RECEIVER.intensidadeAlvo");
      if (props.toleranciaIntensidade !== undefined) numeroNaoNegativo(props.toleranciaIntensidade, "RECEIVER.toleranciaIntensidade");
    },
    criarEstado: () => ({ ...feixeEmRepouso(), atingido: false }),
    reduzir: ({ state }) => ({ state, events: [] }),
    feedbackPublico: (state) => ({ intensidade: state.intensidade, cor: state.cor, atingido: state.atingido }),
  });

  return registry;
}

function criarContextoOptico(config, seed) {
  validarTopologia(config);
  return { config, seed, registry: criarRegistryOptico(), posProcessarComponentes: propagarOptica };
}

module.exports = {
  criarRegistryOptico,
  criarContextoOptico,
  validarTopologia,
  propagarOptica,
  CANAIS,
};
