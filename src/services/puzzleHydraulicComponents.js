// Evento "O Coração da Máquina Celestial" — Fase 6 (Hidráulica).
// Componentes reutilizáveis de fluxo: PUMP, PIPE, VALVE, PRESSURE_NODE,
// RESERVOIR, TURBINE. Mesmo padrão arquitetural das Fases 3/5: registry
// declarativo sobre o engine da Fase 2 + `posProcessarComponentes`
// recalculando o grafo inteiro a partir da topologia a cada ação.
//
// REGRA DE DESIGN (mesmo critério pedagógico — nunca CFD/física
// pesada, sempre regras simples e explicáveis, recalculadas do ZERO a
// cada ação, nunca incremental/dependente de "tempo passado"):
//   - Um fluxo tem só UM atributo: `vazao` (número, "quanto está
//     passando agora"). PRESSURE_NODE deriva `pressao` a partir dela;
//     RESERVOIR deriva `nivel`; mais nada.
//   - PIPE tem uma `vazaoMaxima` (o "limite" pedido na encomenda):
//     NUNCA deixa passar mais que isso — excesso fica `sobrecarregado`
//     e o que passa adiante é sempre o mínimo entre entrada e limite.
//   - VALVE (ações ABRIR/FECHAR) passa 1:1 ou corta (0), igual
//     Clutch/Shutter das Fases 3/5.
//   - PRESSURE_NODE mede (`pressao = vazao * fatorPressao`) mas NUNCA
//     bloqueia — sempre repassa a vazão recebida 1:1 adiante.
//   - RESERVOIR é o "overflow" da encomenda: `nivel = min(vazao,
//     capacidade)`, `transbordando = vazao > capacidade`.
//   - TURBINE é o terminal de objetivo (como Output/Receiver):
//     `atingido` compara a vazão recebida com o alvo.
const { criarRegistryDeComponentes } = require("./puzzleComponentRegistry");
const { validarSemCiclos } = require("./puzzleEngineCore");

function erro(mensagem, statusCode = 400, code) {
  return Object.assign(new Error(mensagem), { statusCode, code });
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

const TIPOS_HIDRAULICOS = new Set(["PUMP", "PIPE", "VALVE", "PRESSURE_NODE", "RESERVOIR", "TURBINE"]);

function fluxoEmRepouso() {
  return { vazao: 0 };
}

function validarTopologia(config) {
  return validarSemCiclos(config, TIPOS_HIDRAULICOS, { codigoErro: "TOPOLOGIA_CICLO" });
}

// ---------------------------------------------------------------------------
// Propagação — mesmo esqueleto de BFS-com-pai das Fases 3/5 (nunca
// confundir "voltar pelo cano que eu vim" com uma segunda fonte
// convergindo). VALVE checa o PRÓPRIO estado atual (aberta, lido de
// `components` — o mapa ANTES do reset) pra decidir se corta.
function propagarHidraulica({ config, components }) {
  const compPorId = new Map(config.components.map((c) => [c.id, c]));
  const novoMapa = { ...components };

  for (const comp of config.components) {
    if (TIPOS_HIDRAULICOS.has(comp.type) && comp.type !== "PUMP") {
      novoMapa[comp.id] = { ...novoMapa[comp.id], ...fluxoEmRepouso() };
    }
  }

  const visitado = new Set();
  const fila = [];

  for (const comp of config.components) {
    if (comp.type !== "PUMP") continue;
    const estadoAtual = components[comp.id] || {};
    const ligada = !!estadoAtual.ligada;
    const vazao = ligada ? comp.props.vazaoNominal : 0;
    novoMapa[comp.id] = { ...estadoAtual, ligada, vazao };
    visitado.add(comp.id);
    fila.push({ id: comp.id, vazao, veioDe: null });
  }

  const conexoesPorNo = new Map();
  for (const conn of config.connections || []) {
    const a = conn.from.componentId;
    const b = conn.to.componentId;
    if (!TIPOS_HIDRAULICOS.has(compPorId.get(a)?.type) || !TIPOS_HIDRAULICOS.has(compPorId.get(b)?.type)) continue;
    if (!conexoesPorNo.has(a)) conexoesPorNo.set(a, []);
    if (!conexoesPorNo.has(b)) conexoesPorNo.set(b, []);
    conexoesPorNo.get(a).push(b);
    conexoesPorNo.get(b).push(a);
  }

  while (fila.length > 0) {
    const atual = fila.shift();
    for (const vizinhoId of conexoesPorNo.get(atual.id) || []) {
      if (vizinhoId === atual.veioDe) continue;
      if (visitado.has(vizinhoId)) {
        throw erro(
          `Topologia hidráulica inválida em runtime: '${vizinhoId}' recebe mais de uma fonte de fluxo (ciclo ou convergência).`,
          409,
          "TOPOLOGIA_CICLO",
        );
      }
      const destinoComp = compPorId.get(vizinhoId);
      let resultado = transformar(destinoComp, atual);
      resultado = aplicarBloqueioManual(destinoComp, components[vizinhoId], resultado);
      novoMapa[vizinhoId] = { ...novoMapa[vizinhoId], ...resultado };
      visitado.add(vizinhoId);
      fila.push({ id: vizinhoId, vazao: resultado.vazao, veioDe: atual.id });
    }
  }

  for (const comp of config.components) {
    if (comp.type !== "TURBINE") continue;
    const estado = novoMapa[comp.id];
    novoMapa[comp.id] = { ...estado, atingido: turbinaAtingida(comp.props, estado) };
  }

  return novoMapa;
}

function turbinaAtingida(props, estado) {
  return Math.abs(estado.vazao - props.vazaoAlvo) <= (props.toleranciaVazao ?? 0);
}

// Regra central (documentada no cabeçalho): PIPE limita (nunca deixa
// passar mais que vazaoMaxima, fica sobrecarregado quando isso
// acontece); PRESSURE_NODE deriva pressao sem nunca bloquear;
// RESERVOIR deriva nivel/transbordando; qualquer outro destino é
// passagem 1:1 (VALVE/TURBINE sem bloqueio — o corte da VALVE é
// aplicado depois, em aplicarBloqueioManual).
function transformar(destinoComp, entrada) {
  if (destinoComp.type === "PIPE") {
    const vazaoSaida = Math.min(entrada.vazao, destinoComp.props.vazaoMaxima);
    return { vazao: vazaoSaida, sobrecarregado: entrada.vazao > destinoComp.props.vazaoMaxima };
  }
  if (destinoComp.type === "PRESSURE_NODE") {
    return { vazao: entrada.vazao, pressao: entrada.vazao * destinoComp.props.fatorPressao };
  }
  if (destinoComp.type === "RESERVOIR") {
    // `vazao` segue junto (passthrough) mesmo aqui — um Reservoir pode
    // ter conexões rio abaixo (ex.: um extravasor) e o resto do grafo
    // sempre espera `entrada.vazao` definido, nunca undefined.
    const nivel = Math.min(entrada.vazao, destinoComp.props.capacidade);
    return { vazao: entrada.vazao, nivel, transbordando: entrada.vazao > destinoComp.props.capacidade };
  }
  return { vazao: entrada.vazao };
}

// VALVE precisa checar o PRÓPRIO estado atual (aberta) pra decidir se
// corta — `transformar` acima nunca olha pro estado do destino, só
// pro tipo, então o corte é aplicado aqui, sobrescrevendo o resultado
// pra vazão 0 quando fechada.
function aplicarBloqueioManual(destinoComp, estadoAtualDestino, resultado) {
  if (destinoComp.type === "VALVE" && estadoAtualDestino?.aberta === false) {
    return { ...resultado, vazao: 0 };
  }
  return resultado;
}

// ---------------------------------------------------------------------------
function criarRegistryHidraulico() {
  const registry = criarRegistryDeComponentes();

  registry.registrar({
    key: "PUMP",
    validarProps: (props) => numeroPositivo(props.vazaoNominal, "PUMP.vazaoNominal"),
    criarEstado: () => ({ ligada: false, vazao: 0 }),
    reduzir: ({ state, action, props }) => {
      if (action.type === "LIGAR") return { state: { ...state, ligada: true, vazao: props.vazaoNominal }, events: [{ tipo: "BOMBA_LIGADA" }] };
      if (action.type === "DESLIGAR") return { state: { ...state, ligada: false, vazao: 0 }, events: [{ tipo: "BOMBA_DESLIGADA" }] };
      return { state, events: [] };
    },
    feedbackPublico: (state) => ({ ligada: state.ligada, vazao: state.vazao }),
  });

  registry.registrar({
    key: "PIPE",
    validarProps: (props) => numeroPositivo(props.vazaoMaxima, "PIPE.vazaoMaxima"),
    criarEstado: () => ({ vazao: 0, sobrecarregado: false }),
    reduzir: ({ state }) => ({ state, events: [] }),
    feedbackPublico: (state, props) => ({ vazao: state.vazao, sobrecarregado: state.sobrecarregado, vazaoMaxima: props.vazaoMaxima }),
  });

  registry.registrar({
    key: "VALVE",
    criarEstado: () => ({ aberta: false, vazao: 0 }),
    reduzir: ({ state, action }) => {
      if (action.type === "ABRIR") return { state: { ...state, aberta: true }, events: [{ tipo: "VALVULA_ABERTA" }] };
      if (action.type === "FECHAR") return { state: { ...state, aberta: false }, events: [{ tipo: "VALVULA_FECHADA" }] };
      return { state, events: [] };
    },
    feedbackPublico: (state) => ({ aberta: state.aberta, vazao: state.vazao }),
  });

  registry.registrar({
    key: "PRESSURE_NODE",
    validarProps: (props) => numeroPositivo(props.fatorPressao, "PRESSURE_NODE.fatorPressao"),
    criarEstado: () => ({ vazao: 0, pressao: 0 }),
    reduzir: ({ state }) => ({ state, events: [] }),
    feedbackPublico: (state) => ({ vazao: state.vazao, pressao: state.pressao }),
  });

  registry.registrar({
    key: "RESERVOIR",
    validarProps: (props) => numeroPositivo(props.capacidade, "RESERVOIR.capacidade"),
    criarEstado: () => ({ nivel: 0, transbordando: false }),
    reduzir: ({ state }) => ({ state, events: [] }),
    feedbackPublico: (state, props) => ({ nivel: state.nivel, transbordando: state.transbordando, capacidade: props.capacidade }),
  });

  registry.registrar({
    key: "TURBINE",
    validarProps: (props) => {
      numeroNaoNegativo(props.vazaoAlvo, "TURBINE.vazaoAlvo");
      if (props.toleranciaVazao !== undefined) numeroNaoNegativo(props.toleranciaVazao, "TURBINE.toleranciaVazao");
    },
    criarEstado: () => ({ vazao: 0, atingido: false }),
    reduzir: ({ state }) => ({ state, events: [] }),
    feedbackPublico: (state) => ({ vazao: state.vazao, atingido: state.atingido }),
  });

  return registry;
}

function criarContextoHidraulico(config, seed) {
  validarTopologia(config);
  return { config, seed, registry: criarRegistryHidraulico(), posProcessarComponentes: propagarHidraulica };
}

module.exports = {
  criarRegistryHidraulico,
  criarContextoHidraulico,
  validarTopologia,
  propagarHidraulica,
};
