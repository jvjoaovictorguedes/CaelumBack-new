// Arena Ranqueada v1 (PvP Competitivo) — todos os valores numéricos da
// spec centralizados aqui, nunca espalhados pelos services (§4/§5/§12).
const RATING_INICIAL = 1000;
const RATING_MINIMO = 0;

const ELO_K_PLACEMENT = 40; // primeiras 10 partidas ranqueadas da temporada
const ELO_K_NORMAL = 24;
const PARTIDAS_PLACEMENT = 10;

// §4 — expansão da faixa de busca por tempo na fila (ms → ±rating)
const FAIXAS_MATCHMAKING = [
  { ateMs: 15_000, faixa: 100 },
  { ateMs: 30_000, faixa: 150 },
  { ateMs: 45_000, faixa: 200 },
  { ateMs: 60_000, faixa: 300 },
  { ateMs: Infinity, faixa: 400 },
];

// §6 — liga é só apresentação, derivada do rating (não persistida)
const LIGAS = [
  { min: 0, max: 799, nome: "Ferro" },
  { min: 800, max: 999, nome: "Bronze" },
  { min: 1000, max: 1199, nome: "Prata" },
  { min: 1200, max: 1399, nome: "Ouro" },
  { min: 1400, max: 1599, nome: "Platina" },
  { min: 1600, max: 1799, nome: "Diamante" },
  { min: 1800, max: Infinity, nome: "Mestre" },
];

const JANELA_RECONEXAO_SEGUNDOS = 30;

// §12 — soft reset no início da temporada seguinte
const FATOR_SOFT_RESET = 0.5;

const DURACAO_TEMPORADA_SEMANAS = 8;

// §15 — mínimo de partidas pra aparecer no leaderboard público
const LEADERBOARD_MINIMO_PARTIDAS = 5;
const LEADERBOARD_TAMANHO_PAGINA = 50;

// §10 — anti-farm específico do ranqueado
const RANKED_MAX_REMATCHES_CONSECUTIVOS = 2;

module.exports = {
  RATING_INICIAL,
  RATING_MINIMO,
  ELO_K_PLACEMENT,
  ELO_K_NORMAL,
  PARTIDAS_PLACEMENT,
  FAIXAS_MATCHMAKING,
  LIGAS,
  JANELA_RECONEXAO_SEGUNDOS,
  FATOR_SOFT_RESET,
  DURACAO_TEMPORADA_SEMANAS,
  LEADERBOARD_MINIMO_PARTIDAS,
  LEADERBOARD_TAMANHO_PAGINA,
  RANKED_MAX_REMATCHES_CONSECUTIVOS,
};
