// Evento "O Coração da Máquina Celestial" — Fase 3 (Sistema Mecânico).
// Componentes reutilizáveis de transmissão: Motor, Shaft (eixo), Gear
// (engrenagem), Pulley (polia), Lever (alavanca), Clutch (embreagem),
// Output (saída/objetivo). Registrados no registry declarativo da Fase
// 2 (puzzleComponentRegistry) — nenhuma lógica nova de persistência/
// transporte aqui, só regras de domínio mecânico, puras.
//
// REGRA DE DESIGN (pedido explícito da encomenda): nada de física real
// (sem inércia, sem atrito, sem torque newtoniano). As regras são
// deliberadamente simples e EXPLICÁVEIS ao jogador:
//   - Engrenagem (GEAR) engrenando direto em outra GEAR: inverte o
//     sentido de rotação e multiplica a velocidade pela razão de
//     dentes (dentesOrigem / dentesDestino) — exatamente como uma
//     caixa de engrenagens de brinquedo.
//   - Qualquer OUTRA ligação direta numa engrenagem (motor, eixo,
//     embreagem) só repassa a rotação 1:1, sem inverter.
//   - Polia (PULLEY) ligada em outra PULLEY direto: multiplica pela
//     razão de raios, mas NUNCA inverte sentido (correia não inverte,
//     diferente de engrenagem — essa é a lição pedagógica da Fase 4
//     "Oficina dos Eixos").
//   - Eixo (SHAFT) e Embreagem (CLUTCH) engatada: repassam 1:1.
//   - Embreagem desengatada: corta a transmissão (0 RPM) dali pra frente.
//   - Alavanca (LEVER) nunca participa da transmissão — é um controle
//     manual puro, só liga/desliga via ação do jogador (ex.: engatar
//     uma Clutch), nunca "gira".
//
// A PROPAGAÇÃO (quem gira a que velocidade, em que sentido) é
// recalculada do ZERO a cada ação via `propagarMecanica`, nunca
// incrementalmente — isso é o que garante determinismo: o resultado
// depende só da topologia (config.connections, imutável) + do estado
// atual de ligado/engatada de cada nó, nunca de "quanto tempo passou"
// ou de ordem de chamadas anteriores.
const { criarRegistryDeComponentes } = require("./puzzleComponentRegistry");
const { validarSemCiclos } = require("./puzzleEngineCore");

function erro(mensagem, statusCode = 400, code) {
  return Object.assign(new Error(mensagem), { statusCode, code });
}

const SENTIDOS = ["CW", "CCW"];
function inverterSentido(sentido) {
  if (sentido === "CW") return "CCW";
  if (sentido === "CCW") return "CW";
  return null;
}
function validarSentido(valor, contexto) {
  if (!SENTIDOS.includes(valor)) throw erro(`${contexto}: sentido precisa ser "CW" ou "CCW".`);
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
function inteiroPositivo(valor, contexto) {
  if (!Number.isInteger(valor) || valor <= 0) {
    throw erro(`${contexto}: precisa ser um número inteiro positivo.`);
  }
}

// ---------------------------------------------------------------------------
// MOTOR ajustável (evolução "Regulador do Eixo Mestre") — valida os
// limites declarados no config (Admin) e, separadamente, o valor que o
// JOGADOR manda via AJUSTAR_RPM. As duas validações são distintas de
// propósito: `validarLimitesDoRegulador` roda em validarProps (config
// do Admin, confia menos — pode estar quebrado); `validarAjusteDeRpm`
// roda a cada ação do jogador (config já confiável, só o `rpm` do
// payload precisa de checagem).
function validarLimitesDoRegulador(props) {
  inteiroPositivo(props.rpmMin, "MOTOR.rpmMin");
  inteiroPositivo(props.rpmMax, "MOTOR.rpmMax");
  inteiroPositivo(props.rpmStep, "MOTOR.rpmStep");
  inteiroPositivo(props.rpmInicial, "MOTOR.rpmInicial");
  if (props.rpmMax <= props.rpmMin) throw erro("MOTOR.rpmMax precisa ser maior que rpmMin.");
  if (props.rpmInicial < props.rpmMin || props.rpmInicial > props.rpmMax) {
    throw erro("MOTOR.rpmInicial precisa estar entre rpmMin e rpmMax.");
  }
  if ((props.rpmInicial - props.rpmMin) % props.rpmStep !== 0) {
    throw erro("MOTOR.rpmInicial precisa ser alcançável a partir de rpmMin respeitando rpmStep.");
  }
}

// Único validador do valor que o CLIENTE manda em AJUSTAR_RPM — nunca
// confia em nada vindo do payload além de `rpm` (número). Mensagens
// específicas por regra (não um "inválido" genérico) porque o Admin/QA
// usa isso pra depurar uma golden solution que não bate.
function validarAjusteDeRpm(props, payload) {
  if (props.ajustavel !== true) {
    throw erro("Este MOTOR não é ajustável — rpm é fixo (rpmNominal do config).", 400, "MOTOR_NAO_AJUSTAVEL");
  }
  const rpm = payload?.rpm;
  if (!Number.isInteger(rpm)) {
    throw erro("AJUSTAR_RPM: payload.rpm precisa ser um número inteiro.", 400, "RPM_INVALIDO");
  }
  if (rpm < props.rpmMin || rpm > props.rpmMax) {
    throw erro(`AJUSTAR_RPM: rpm precisa estar entre ${props.rpmMin} e ${props.rpmMax}.`, 400, "RPM_FORA_DO_LIMITE");
  }
  if ((rpm - props.rpmMin) % props.rpmStep !== 0) {
    throw erro(`AJUSTAR_RPM: rpm precisa respeitar o passo de ${props.rpmStep} a partir de ${props.rpmMin}.`, 400, "RPM_FORA_DO_PASSO");
  }
  return rpm;
}

// Ressonância qualitativa do OUTPUT (evolução "esconder targets do
// jogador") — NUNCA revela rpmAlvo/toleranciaRpm/sentidoAlvo, só uma
// das 4 faixas abaixo. `outputAtingido` (já existente, usado pelos
// objectives) continua a fonte de verdade BOOLEANA/interna; esta função
// é só a tradução qualitativa pra feedback público, nunca o contrário.
// Sentido errado NUNCA pode render ESTAVEL, mesmo com rpm exato (seção
// 9 da encomenda) — cai pra PROXIMA (fisicamente "quase", mas invertido).
function classificarRessonancia(props, estado) {
  const alvo = props.rpmAlvo;
  const tolerancia = props.toleranciaRpm ?? 0;
  const distancia = Math.abs(estado.rpm - alvo);
  const dentroDaTolerancia = distancia <= tolerancia;
  const sentidoCorreto = props.sentidoAlvo === undefined || estado.sentido === props.sentidoAlvo;
  if (dentroDaTolerancia && sentidoCorreto) return "ESTAVEL";
  if (dentroDaTolerancia) return "PROXIMA"; // rpm exato, mas sentido errado — "vibra em oposição"
  const base = Math.max(Math.abs(alvo), 1); // nunca dividir por zero quando alvo=0
  const percentual = distancia / base;
  if (percentual <= 0.1) return "PROXIMA";
  if (percentual <= 0.25) return "FRACA";
  return "SEM_RESONANCIA";
}

// Tipos que participam da transmissão rotacional (grafo de propagação).
// LEVER fica de fora de propósito — é controle manual, nunca "gira".
const TIPOS_ROTACIONAIS = new Set(["MOTOR", "SHAFT", "GEAR", "PULLEY", "CLUTCH", "OUTPUT"]);

function estadoRotacionalEmRepouso() {
  return { rpm: 0, sentido: null };
}

// ---------------------------------------------------------------------------
// Validação de topologia — estrutural, independente do estado runtime
// (ligado/engatada). Detecta ciclo via union-find sobre o grafo NÃO
// direcionado formado só pelas conexões entre nós rotacionais
// (puzzleEngineCore.validarSemCiclos — compartilhado com os outros
// domínios de grafo, Fases 5/6). Chamada uma vez na criação do
// contexto mecânico (fail-fast) e reaproveitada pelo validador de
// solvabilidade do Admin na Fase 15 antes de publicar um Blueprint.
function validarTopologia(config) {
  return validarSemCiclos(config, TIPOS_ROTACIONAIS, { codigoErro: "TOPOLOGIA_CICLO" });
}

// ---------------------------------------------------------------------------
// Propagação — BFS a partir de cada MOTOR. `visitado` é compartilhado
// entre todos os motores: se dois caminhos alcançarem o MESMO nó (duas
// fontes convergindo, ou um ciclo que `validarTopologia` deveria ter
// pego antes), é erro em runtime também (defesa em profundidade).
function propagarMecanica({ config, components }) {
  const compPorId = new Map(config.components.map((c) => [c.id, c]));
  const novoMapa = { ...components };

  // Reset: todo nó rotacional começa em repouso; propagação abaixo
  // sobrescreve só rpm/sentido dos alcançáveis, preservando outros
  // campos de estado (ex.: Clutch.engatada, que é controlado por ação
  // do jogador, nunca pela propagação).
  for (const comp of config.components) {
    if (TIPOS_ROTACIONAIS.has(comp.type) && comp.type !== "MOTOR") {
      novoMapa[comp.id] = { ...novoMapa[comp.id], ...estadoRotacionalEmRepouso() };
    }
  }

  const visitado = new Set();
  const fila = [];

  for (const comp of config.components) {
    if (comp.type !== "MOTOR") continue;
    const estadoAtual = components[comp.id] || {};
    const ligado = !!estadoAtual.ligado;
    // Evolução "Regulador do Eixo Mestre": o rpm NOMINAL do config é só
    // o comportamento LEGADO (motor fixo). Um motor `ajustavel: true`
    // usa `estadoAtual.rpmConfigurado` (runtime, mutado só por
    // LIGAR/AJUSTAR_RPM via o reduzir() abaixo) como fonte — a
    // propagação roda de novo a cada ação (nunca incremental), então um
    // AJUSTAR_RPM com o motor já ligado recalcula a transmissão inteira
    // na MESMA ação, sem precisar de um 2º LIGAR.
    const rpmEfetivo = comp.props.ajustavel === true ? estadoAtual.rpmConfigurado : comp.props.rpmNominal;
    const rpm = ligado ? rpmEfetivo : 0;
    const sentido = ligado ? comp.props.sentido : null;
    novoMapa[comp.id] = { ...estadoAtual, ligado, rpm, sentido };
    visitado.add(comp.id);
    fila.push({ id: comp.id, rpm, sentido, veioDe: null });
  }

  const conexoesPorNo = new Map();
  for (const conn of config.connections || []) {
    const a = conn.from.componentId;
    const b = conn.to.componentId;
    if (!TIPOS_ROTACIONAIS.has(compPorId.get(a)?.type) || !TIPOS_ROTACIONAIS.has(compPorId.get(b)?.type)) continue;
    if (!conexoesPorNo.has(a)) conexoesPorNo.set(a, []);
    if (!conexoesPorNo.has(b)) conexoesPorNo.set(b, []);
    conexoesPorNo.get(a).push(b);
    conexoesPorNo.get(b).push(a);
  }

  while (fila.length > 0) {
    const atual = fila.shift();
    const origemComp = compPorId.get(atual.id);
    for (const vizinhoId of conexoesPorNo.get(atual.id) || []) {
      // O grafo de adjacência é não-direcionado (cada conexão vira uma
      // aresta nos dois sentidos), então todo nó não-raiz tem o próprio
      // nó de origem como vizinho — isso é voltar pelo mesmo cabo, não
      // uma segunda fonte. Só uma SEGUNDA aresta chegando num nó já
      // visitado por um caminho diferente é convergência/ciclo real.
      if (vizinhoId === atual.veioDe) continue;
      if (visitado.has(vizinhoId)) {
        throw erro(
          `Topologia mecânica inválida em runtime: '${vizinhoId}' recebe mais de uma fonte de rotação (ciclo ou convergência).`,
          409,
          "TOPOLOGIA_CICLO",
        );
      }
      const destinoComp = compPorId.get(vizinhoId);
      const { rpm: rpmSaida, sentido: sentidoSaida } = transformar(origemComp, destinoComp, atual, novoMapa[vizinhoId]);
      novoMapa[vizinhoId] = { ...novoMapa[vizinhoId], rpm: rpmSaida, sentido: sentidoSaida };
      visitado.add(vizinhoId);
      fila.push({ id: vizinhoId, rpm: rpmSaida, sentido: sentidoSaida, veioDe: atual.id });
    }
  }

  // Objetivo (Output) é sempre recalculado por último, usando o rpm/
  // sentido que acabaram de ser atribuídos (0/null pros não alcançados).
  for (const comp of config.components) {
    if (comp.type !== "OUTPUT") continue;
    const estado = novoMapa[comp.id];
    novoMapa[comp.id] = { ...estado, atingido: outputAtingido(comp.props, estado) };
  }

  return novoMapa;
}

function outputAtingido(props, estado) {
  const dentroDaTolerancia = Math.abs(estado.rpm - props.rpmAlvo) <= (props.toleranciaRpm ?? 0);
  const sentidoCorreto = props.sentidoAlvo === undefined || estado.sentido === props.sentidoAlvo;
  return dentroDaTolerancia && sentidoCorreto;
}

// Regra central documentada no cabeçalho: só GEAR→GEAR inverte+escala
// por dentes; só PULLEY→PULLEY escala por raio (nunca inverte); CLUTCH
// desengatada corta (0); qualquer outro par é passagem 1:1.
function transformar(origemComp, destinoComp, entrada, estadoAtualDestino) {
  if (destinoComp.type === "CLUTCH") {
    const engatada = !!estadoAtualDestino?.engatada;
    if (!engatada) return { rpm: 0, sentido: null };
    return { rpm: entrada.rpm, sentido: entrada.sentido };
  }
  if (destinoComp.type === "GEAR" && origemComp.type === "GEAR") {
    if (entrada.rpm === 0) return { rpm: 0, sentido: null };
    const ratio = origemComp.props.dentes / destinoComp.props.dentes;
    return { rpm: entrada.rpm * ratio, sentido: inverterSentido(entrada.sentido) };
  }
  if (destinoComp.type === "PULLEY" && origemComp.type === "PULLEY") {
    if (entrada.rpm === 0) return { rpm: 0, sentido: null };
    const ratio = origemComp.props.raio / destinoComp.props.raio;
    return { rpm: entrada.rpm * ratio, sentido: entrada.sentido };
  }
  return { rpm: entrada.rpm, sentido: entrada.sentido };
}

// ---------------------------------------------------------------------------
// Registry mecânico — cada chamador (puzzleInstanceService na Fase 8,
// ou um teste) pede um registry NOVO (`criarRegistryMecanico()`), nunca
// reaproveita um Map global, mesmo critério documentado em
// puzzleComponentRegistry.js.
function criarRegistryMecanico() {
  const registry = criarRegistryDeComponentes();

  registry.registrar({
    key: "MOTOR",
    // Compatibilidade (seção 1 da encomenda): `ajustavel !== true` é o
    // comportamento LEGADO de sempre — só valida rpmNominal/sentido,
    // nunca exige rpmMin/rpmMax/rpmStep/rpmInicial. Blueprints antigos
    // (sem a chave `ajustavel` no config) continuam passando por aqui
    // inalterados.
    validarProps: (props) => {
      if (props.ajustavel === true) {
        validarLimitesDoRegulador(props);
      } else {
        numeroPositivo(props.rpmNominal, "MOTOR.rpmNominal");
      }
      validarSentido(props.sentido, "MOTOR.sentido");
    },
    criarEstado: (props) =>
      props.ajustavel === true
        ? { ligado: false, rpmConfigurado: props.rpmInicial, rpm: 0, sentido: null }
        : { ligado: false, rpm: 0, sentido: null },
    reduzir: ({ state, action, props }) => {
      if (action.type === "LIGAR") {
        const rpmEfetivo = props.ajustavel === true ? state.rpmConfigurado : props.rpmNominal;
        return { state: { ...state, ligado: true, rpm: rpmEfetivo, sentido: props.sentido }, events: [{ tipo: "MOTOR_LIGADO" }] };
      }
      if (action.type === "DESLIGAR") {
        // `rpmConfigurado` nunca é perdido ao desligar (seção 2 —
        // "configura 160 → liga → desliga → liga de novo → volta a
        // 160") — só `rpm`/`sentido` (o EFEITO visível) zera; `...state`
        // preserva rpmConfigurado pra motores ajustáveis.
        return { state: { ...state, ligado: false, rpm: 0, sentido: null }, events: [{ tipo: "MOTOR_DESLIGADO" }] };
      }
      if (action.type === "AJUSTAR_RPM") {
        const rpm = validarAjusteDeRpm(props, action.payload);
        // Permitido com o motor ligado (seção 4) — `rpm` efetivo já
        // muda nesta MESMA ação; propagarMecanica (hook pós-processo,
        // roda sempre) recalcula a transmissão inteira a partir do
        // `rpmConfigurado` novo, nunca incrementalmente.
        return {
          state: { ...state, rpmConfigurado: rpm, rpm: state.ligado ? rpm : state.rpm },
          events: [{ tipo: "MOTOR_RPM_AJUSTADO", rpm }],
        };
      }
      return { state, events: [] };
    },
    // Motor ajustável expõe os limites do regulador (nunca segredo —
    // o jogador PRECISA saber min/max/step pra operar o controle) +
    // `rpmConfigurado` (o valor "guardado", mesmo desligado). Motor
    // legado mantém o shape EXATO de sempre (só ligado/rpm/sentido) —
    // nunca uma chave nova aparece pra quem não optou por `ajustavel`.
    feedbackPublico: (state, props) =>
      props.ajustavel === true
        ? {
            ligado: state.ligado,
            rpm: state.rpm,
            sentido: state.sentido,
            ajustavel: true,
            rpmConfigurado: state.rpmConfigurado,
            rpmMin: props.rpmMin,
            rpmMax: props.rpmMax,
            rpmStep: props.rpmStep,
          }
        : { ligado: state.ligado, rpm: state.rpm, sentido: state.sentido },
  });

  registry.registrar({
    key: "SHAFT",
    criarEstado: () => estadoRotacionalEmRepouso(),
    reduzir: ({ state }) => ({ state, events: [] }), // nunca acionado diretamente; só propagação
    feedbackPublico: (state) => ({ rpm: state.rpm, sentido: state.sentido }),
  });

  registry.registrar({
    key: "GEAR",
    validarProps: (props) => numeroPositivo(props.dentes, "GEAR.dentes"),
    criarEstado: () => estadoRotacionalEmRepouso(),
    reduzir: ({ state }) => ({ state, events: [] }),
    feedbackPublico: (state, props) => ({ rpm: state.rpm, sentido: state.sentido, dentes: props.dentes }),
  });

  registry.registrar({
    key: "PULLEY",
    validarProps: (props) => numeroPositivo(props.raio, "PULLEY.raio"),
    criarEstado: () => estadoRotacionalEmRepouso(),
    reduzir: ({ state }) => ({ state, events: [] }),
    feedbackPublico: (state, props) => ({ rpm: state.rpm, sentido: state.sentido, raio: props.raio }),
  });

  registry.registrar({
    key: "LEVER",
    criarEstado: () => ({ acionada: false }),
    reduzir: ({ state, action }) => {
      if (action.type !== "ACIONAR") return { state, events: [] };
      return { state: { ...state, acionada: !state.acionada }, events: [{ tipo: "ALAVANCA_ACIONADA", acionada: !state.acionada }] };
    },
    feedbackPublico: (state) => ({ acionada: state.acionada }),
  });

  registry.registrar({
    key: "CLUTCH",
    criarEstado: () => ({ engatada: false, rpm: 0, sentido: null }),
    reduzir: ({ state, action }) => {
      if (action.type === "ENGATAR") return { state: { ...state, engatada: true }, events: [{ tipo: "EMBREAGEM_ENGATADA" }] };
      if (action.type === "DESENGATAR") return { state: { ...state, engatada: false }, events: [{ tipo: "EMBREAGEM_DESENGATADA" }] };
      return { state, events: [] };
    },
    feedbackPublico: (state) => ({ engatada: state.engatada, rpm: state.rpm, sentido: state.sentido }),
  });

  registry.registrar({
    key: "OUTPUT",
    validarProps: (props) => {
      numeroNaoNegativo(props.rpmAlvo, "OUTPUT.rpmAlvo"); // aceita rpmAlvo=0 (saída deve ficar parada)
      if (props.sentidoAlvo !== undefined) validarSentido(props.sentidoAlvo, "OUTPUT.sentidoAlvo");
      if (props.toleranciaRpm !== undefined && (typeof props.toleranciaRpm !== "number" || props.toleranciaRpm < 0)) {
        throw erro("OUTPUT.toleranciaRpm precisa ser número >= 0.");
      }
    },
    criarEstado: () => ({ ...estadoRotacionalEmRepouso(), atingido: false }),
    reduzir: ({ state }) => ({ state, events: [] }),
    // Evolução "esconder targets do jogador" (seção 7/8 da encomenda):
    // `atingido` (boolean cru "alvo atingido sim/não") NUNCA sai aqui —
    // só a classificação qualitativa de `classificarRessonancia`, que
    // não precisa do valor-alvo pra ser calculada no cliente porque ela
    // já chega PRONTA do servidor. `state.atingido` continua existindo
    // (`estado.components.outputX.atingido`, nunca em `.public`) só pra
    // os objectives (avaliarCondicao), que sempre leem o state INTERNO,
    // nunca o feedbackPublico.
    feedbackPublico: (state, props) => ({ rpm: state.rpm, sentido: state.sentido, ressonancia: classificarRessonancia(props, state) }),
  });

  return registry;
}

// Monta o PuzzleSimulationContext já com o hook de propagação ligado e
// a topologia validada fail-fast (uma vez, na criação) — ponto de
// entrada único que puzzleInstanceService (Fase 8) e os testes devem
// usar pra configs mecânicos, nunca montar o contexto manualmente.
function criarContextoMecanico(config, seed) {
  validarTopologia(config);
  return { config, seed, registry: criarRegistryMecanico(), posProcessarComponentes: propagarMecanica };
}

module.exports = {
  criarRegistryMecanico,
  criarContextoMecanico,
  validarTopologia,
  propagarMecanica,
  inverterSentido,
  validarAjusteDeRpm,
  classificarRessonancia,
};
