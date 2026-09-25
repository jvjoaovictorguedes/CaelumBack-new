// Caçadas §7 — resolve nível/título/próximo marco/pool de dificuldade
// a partir de reputation_points. Único lugar que interpreta
// HUNT_REPUTATION_LEVELS/HUNT_DIFFICULTY_WEIGHTS_BY_REPUTATION — mesmo
// papel que spoilReputationService.js tem pro Balcão de Espólios,
// intencionalmente uma cópia estrutural (não compartilhar código entre
// as duas progressões: são conceitualmente independentes e podem
// divergir de regra no futuro sem se afetar).
const crypto = require("crypto");
const {
  HUNT_REPUTATION_LEVELS: HUNT_REPUTATION_LEVELS_PADRAO,
  HUNT_DIFFICULTY_WEIGHTS_BY_REPUTATION: HUNT_DIFFICULTY_WEIGHTS_BY_REPUTATION_PADRAO,
} = require("../config/huntConfig");
const gameSettingCache = require("./gameSettingCache");

// Painel Administrativo Fase 11 — mesmo raciocínio de
// spoilReputationService.js: admin pode sobrescrever via GameSetting
// ("hunts.reputationLevels"/"hunts.difficultyWeightsByReputation", ver
// adminHuntConfigService.js), leitura sempre síncrona via cache em
// memória (nunca bate no banco aqui). Sem override salvo, cai
// exatamente nos mesmos arrays/objetos hardcoded de antes.
function niveis() {
  return gameSettingCache.obter("hunts.reputationLevels", HUNT_REPUTATION_LEVELS_PADRAO);
}
function pesosPorReputacao() {
  return gameSettingCache.obter("hunts.difficultyWeightsByReputation", HUNT_DIFFICULTY_WEIGHTS_BY_REPUTATION_PADRAO);
}

function resolverNivel(pontos) {
  const lista = niveis();
  let atual = lista[0];
  for (const nivel of lista) {
    if (pontos >= nivel.minimo) atual = nivel;
    else break;
  }
  return atual;
}

function proximoNivel(nivelAtual) {
  const lista = niveis();
  const indice = lista.findIndex((n) => n.nivel === nivelAtual.nivel);
  return lista[indice + 1] ?? null;
}

function formatarResumoReputacao(pontos) {
  const nivel = resolverNivel(pontos);
  const proximo = proximoNivel(nivel);
  return {
    points: pontos,
    level: nivel.nivel,
    roman: nivel.roman,
    title: nivel.titulo,
    nextLevelAt: proximo ? proximo.minimo : null,
  };
}

// §7.1/§7.2 — sorteia uma dificuldade dentre o pool liberado pro nível
// de Reputação atual, respeitando os pesos configurados. crypto.randomInt
// (RNG de servidor) — mesmo motivo documentado em
// adventureGuildRotationService.js.
function sortearDificuldade(pontos) {
  const nivel = resolverNivel(pontos);
  const pesos = pesosPorReputacao()[nivel.nivel] ?? {};
  const entradas = nivel.pool
    .filter((dificuldade) => (pesos[dificuldade] ?? 0) > 0)
    .map((dificuldade) => [dificuldade, pesos[dificuldade]]);
  if (entradas.length === 0) return nivel.pool[0];

  const total = entradas.reduce((soma, [, peso]) => soma + peso, 0);
  let sorteio = crypto.randomInt(0, total);
  for (const [dificuldade, peso] of entradas) {
    if (sorteio < peso) return dificuldade;
    sorteio -= peso;
  }
  return entradas[entradas.length - 1][0];
}

module.exports = { resolverNivel, proximoNivel, formatarResumoReputacao, sortearDificuldade };
