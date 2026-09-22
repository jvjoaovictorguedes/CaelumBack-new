// Arena Ranqueada v2 (PvP Competitivo) — todos os valores numéricos da
// spec centralizados aqui, nunca espalhados pelos services/controllers.
//
// v2 mudou o modelo inteiro: matchmaking assíncrono (oponente offline
// controlado por IA), Tier+Divisão derivados do rating, deltas fixos por
// diferença de Tier (não mais Elo por valor esperado), limite diário e
// temporadas de 14 dias.
const RATING_INICIAL = 1000;
const RATING_MINIMO = 0;

// ---------------------------------------------------------------
// §4 — Tier + Divisão. NUNCA persistido: é sempre derivado do rating
// (ver rankedTierService.tierDivisaoParaRating). Cada tier lista suas
// divisões IV→I em ordem crescente de rating; Mestre é aberto (3000+)
// e não tem divisão.
// ---------------------------------------------------------------
const TIERS = [
  {
    nome: "Ferro",
    asset: "ferro",
    ordem: 0,
    divisoes: [
      { divisao: "IV", min: 0, max: 699 },
      { divisao: "III", min: 700, max: 799 },
      { divisao: "II", min: 800, max: 899 },
      { divisao: "I", min: 900, max: 999 },
    ],
  },
  {
    nome: "Bronze",
    asset: "bronze",
    ordem: 1,
    divisoes: [
      { divisao: "IV", min: 1000, max: 1099 },
      { divisao: "III", min: 1100, max: 1199 },
      { divisao: "II", min: 1200, max: 1299 },
      { divisao: "I", min: 1300, max: 1399 },
    ],
  },
  {
    nome: "Prata",
    asset: "prata",
    ordem: 2,
    divisoes: [
      { divisao: "IV", min: 1400, max: 1499 },
      { divisao: "III", min: 1500, max: 1599 },
      { divisao: "II", min: 1600, max: 1699 },
      { divisao: "I", min: 1700, max: 1799 },
    ],
  },
  {
    nome: "Ouro",
    asset: "ouro",
    ordem: 3,
    divisoes: [
      { divisao: "IV", min: 1800, max: 1899 },
      { divisao: "III", min: 1900, max: 1999 },
      { divisao: "II", min: 2000, max: 2099 },
      { divisao: "I", min: 2100, max: 2199 },
    ],
  },
  {
    nome: "Platina",
    asset: "platina",
    ordem: 4,
    divisoes: [
      { divisao: "IV", min: 2200, max: 2299 },
      { divisao: "III", min: 2300, max: 2399 },
      { divisao: "II", min: 2400, max: 2499 },
      { divisao: "I", min: 2500, max: 2599 },
    ],
  },
  {
    nome: "Diamante",
    asset: "diamante",
    ordem: 5,
    divisoes: [
      { divisao: "IV", min: 2600, max: 2699 },
      { divisao: "III", min: 2700, max: 2799 },
      { divisao: "II", min: 2800, max: 2899 },
      { divisao: "I", min: 2900, max: 2999 },
    ],
  },
  {
    nome: "Mestre",
    asset: "mestre",
    ordem: 6,
    // Sem divisão: uma única faixa aberta.
    divisoes: [{ divisao: null, min: 3000, max: Infinity }],
  },
];

// ---------------------------------------------------------------
// §5 — ganho/perda de rating por diferença de Tier (o Elo por valor
// esperado da v1 foi REMOVIDO). A chave é (tierOponente.ordem -
// tierJogador.ordem), limitada a -1/0/+1 porque o matchmaking nunca
// pareia além de ±1 Tier (§6).
// ---------------------------------------------------------------
const RANKED_RATING_DELTAS = {
  mesmoTier: { vitoria: 18, derrota: -18 },
  oponenteAcima: { vitoria: 22, derrota: -14 },
  oponenteAbaixo: { vitoria: 14, derrota: -22 },
};

// §6 — pool de candidatos mais próximos por rating de onde um é
// sorteado (nunca o mais próximo sempre, nunca aleatório global).
const RANKED_TAMANHO_POOL_OPONENTES = 10;

// §7 — anti-rematch: máximo de partidas contra o MESMO oponente por
// jogador por dia. Validado contra RankedMatch persistido, não memória.
const RANKED_MAX_PARTIDAS_MESMO_OPONENTE_DIA = 2;

// §11 — limite diário de partidas ranqueadas.
const RANKED_LIMITE_PARTIDAS_DIA = 10;

// Fuso usado pra fechar o "dia" do limite diário e do anti-rematch.
// Escolhido America/Sao_Paulo porque o jogo é pt-BR e a virada do dia
// precisa bater com a meia-noite de quem joga, não com UTC (que viraria
// 21h local). Configurável via env pra não exigir deploy de código caso
// o público mude.
const RANKED_TIMEZONE_DIARIA = process.env.RANKED_TIMEZONE || "America/Sao_Paulo";

// §13 — temporadas de 14 dias corridos (janelas consecutivas a partir
// do starts_at, não mês/semana de calendário).
const DURACAO_TEMPORADA_DIAS = 14;

// §13 — soft reset em direção a 1000, com ajuste por winrate amostrado.
const SOFT_RESET_FATOR_BASE = 0.8;
const SOFT_RESET_AJUSTE_MAXIMO = 60;
const SOFT_RESET_ESCALA_WINRATE = 300;
const SOFT_RESET_JOGOS_AMOSTRA_CHEIA = 10;

// §14 — leaderboard lista desde a 1ª partida válida (0 partidas não
// aparece). Mantido como constante nomeada em vez de literal solto.
const LEADERBOARD_MINIMO_PARTIDAS = 1;
const LEADERBOARD_TAMANHO_PAGINA = 50;

// §9 — IA ranqueada (rankedAiService.js).
const IA_LIMIAR_CURA_PERCENTUAL = 0.35; // abaixo disso, cura vira prioridade
const IA_RESERVA_MANA_PERCENTUAL = 0.2; // não gasta a mana toda sem necessidade
const IA_TAMANHO_TOP_ESCOLHAS = 3; // aleatoriedade ponderada entre as N melhores
const IA_DELAY_TURNO_MS = 900; // "tempo de pensar" pro turno não ser instantâneo

const JANELA_RECONEXAO_SEGUNDOS = 30;

module.exports = {
  RATING_INICIAL,
  RATING_MINIMO,
  TIERS,
  RANKED_RATING_DELTAS,
  RANKED_TAMANHO_POOL_OPONENTES,
  RANKED_MAX_PARTIDAS_MESMO_OPONENTE_DIA,
  RANKED_LIMITE_PARTIDAS_DIA,
  RANKED_TIMEZONE_DIARIA,
  DURACAO_TEMPORADA_DIAS,
  SOFT_RESET_FATOR_BASE,
  SOFT_RESET_AJUSTE_MAXIMO,
  SOFT_RESET_ESCALA_WINRATE,
  SOFT_RESET_JOGOS_AMOSTRA_CHEIA,
  LEADERBOARD_MINIMO_PARTIDAS,
  LEADERBOARD_TAMANHO_PAGINA,
  JANELA_RECONEXAO_SEGUNDOS,
  IA_LIMIAR_CURA_PERCENTUAL,
  IA_RESERVA_MANA_PERCENTUAL,
  IA_TAMANHO_TOP_ESCOLHAS,
  IA_DELAY_TURNO_MS,
};
