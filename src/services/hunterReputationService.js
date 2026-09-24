// Caçadas §7 — resolve nível/título/próximo marco/pool de dificuldade
// a partir de reputation_points. Único lugar que interpreta
// HUNT_REPUTATION_LEVELS/HUNT_DIFFICULTY_WEIGHTS_BY_REPUTATION — mesmo
// papel que spoilReputationService.js tem pro Balcão de Espólios,
// intencionalmente uma cópia estrutural (não compartilhar código entre
// as duas progressões: são conceitualmente independentes e podem
// divergir de regra no futuro sem se afetar).
const crypto = require("crypto");
const { HUNT_REPUTATION_LEVELS, HUNT_DIFFICULTY_WEIGHTS_BY_REPUTATION } = require("../config/huntConfig");

function resolverNivel(pontos) {
  let atual = HUNT_REPUTATION_LEVELS[0];
  for (const nivel of HUNT_REPUTATION_LEVELS) {
    if (pontos >= nivel.minimo) atual = nivel;
    else break;
  }
  return atual;
}

function proximoNivel(nivelAtual) {
  const indice = HUNT_REPUTATION_LEVELS.findIndex((n) => n.nivel === nivelAtual.nivel);
  return HUNT_REPUTATION_LEVELS[indice + 1] ?? null;
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
  const pesos = HUNT_DIFFICULTY_WEIGHTS_BY_REPUTATION[nivel.nivel] ?? {};
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
