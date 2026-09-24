// Configuração central da Guilda dos Aventureiros (§50 da spec) — nada
// de número de balanceamento espalhado por controller/service.
//
// NOMENCLATURA (§11): este Rank é o "Rank de Aventureiro"
// (rank_aventureiro / CharacterAdventureGuildProgress) — INTENCIONALMENTE
// não usa o prefixo "GuildRank"/"guild_rank_*" porque esse nome já
// pertence ao Portal de Ranque COLETIVO da guilda de verdade
// (GuildRankGate/guildGateController.js, guild.rank), um sistema
// totalmente diferente. Também não reaproveita rankService.js
// (F..S++, usado por character.rank/Portal de Ranque individual e por
// guild.rank) — a spec pede uma escada PRÓPRIA, F..S (sem S+/S++), com
// progressão por contrato concluído, não por pontos de combate.
const RANKS_AVENTUREIRO = ["F", "E", "D", "C", "B", "A", "S"];

function indiceDoRankAventureiro(rank) {
  return RANKS_AVENTUREIRO.indexOf(rank);
}

function proximoRankAventureiro(rank) {
  const indice = indiceDoRankAventureiro(rank);
  if (indice === -1 || indice >= RANKS_AVENTUREIRO.length - 1) return null;
  return RANKS_AVENTUREIRO[indice + 1];
}

function ehRankAventureiroValido(rank) {
  return indiceDoRankAventureiro(rank) !== -1;
}

// §13/§17 — 5 ofertas por rotação, no máximo 2 contratos de Rank ativos
// ao mesmo tempo.
const OFERTAS_POR_ROTACAO = 5;
const CONTRATOS_ATIVOS_MAX = 2;

// §15 — rotação global fixa a cada 6h, sempre em UTC (00/06/12/18h),
// nunca dependente do relógio do cliente. Documentado aqui por ser a
// ÚNICA fonte de verdade do fuso: qualquer cálculo de janela em
// qualquer service deve importar isto, nunca reimplementar a conta.
const ROTACAO_HORAS = 6;
const ROTACAO_MS = ROTACAO_HORAS * 60 * 60 * 1000;

function inicioDaJanelaAtual(agora = new Date()) {
  return new Date(Math.floor(agora.getTime() / ROTACAO_MS) * ROTACAO_MS);
}

// §7 — ciclos globais previsíveis pras missões livres (Diária/Semanal/
// Mensal), todos em UTC: diária vira à meia-noite UTC, semanal na
// segunda-feira 00:00 UTC, mensal no dia 1 00:00 UTC.
function inicioDoCicloDiario(agora = new Date()) {
  return Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate());
}

function inicioDoCicloSemanal(agora = new Date()) {
  const diaSemanaUTC = agora.getUTCDay(); // 0=domingo..6=sábado
  const diasDesdeSegunda = (diaSemanaUTC + 6) % 7; // segunda=0
  const inicioDia = inicioDoCicloDiario(agora);
  return inicioDia - diasDesdeSegunda * 24 * 60 * 60 * 1000;
}

function inicioDoCicloMensal(agora = new Date()) {
  return Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1);
}

// §30 — falhar a Provação nunca reduz o contador, só aplica um
// cooldown antes de poder tentar de novo. Valor inicial alinhado à
// rotação (sugestão da própria spec), ajustável.
const COOLDOWN_PROVACAO_MS = 6 * 60 * 60 * 1000;

// §26/§54 — valores de REFERÊNCIA inicial (a spec pede explicitamente
// pra não fechar os números definitivos antes de simular). Calculados
// com uma folga generosa em cima do pior caso realista: 2 contratos
// ativos, 4 rotações/dia (6h), assumindo nem todo contrato é concluído
// a cada rotação — o objetivo é dias pros ranks baixos e semanas/meses
// pros ranks altos (§27), nunca dá pra chegar em S "jogando muitas
// horas seguidas" só numa rotação por vez.
const REQUISITOS_PROMOCAO = {
  F: 8,
  E: 12,
  D: 18,
  C: 26,
  B: 36,
  A: 50,
  // S não promove — é o topo (§32).
};

// Fim do ciclo global ATUAL pra cada categoria de missão livre (§7) —
// é isso que vira `expira_em` em CharacterMissionProgress. Quando o
// relógio passa desse valor, missionService.garantirProgresso detecta
// a expiração (mesma checagem de antes, `expira_em <= now`) e reresta
// o progresso alinhado ao PRÓXIMO ciclo global — nunca de "agora mais
// 24h" como a janela móvel antiga.
function fimDoCicloAtual(categoria, agora = new Date()) {
  if (categoria === "Semanal") {
    return new Date(inicioDoCicloSemanal(agora) + 7 * 24 * 60 * 60 * 1000);
  }
  if (categoria === "Mensal") {
    const mesAtual = new Date(inicioDoCicloMensal(agora));
    return new Date(Date.UTC(mesAtual.getUTCFullYear(), mesAtual.getUTCMonth() + 1, 1));
  }
  // Diaria (padrão) — meia-noite UTC seguinte.
  return new Date(inicioDoCicloDiario(agora) + 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------
// Balcão de Espólios (Especificação "Balcão de Espólios, Venda,
// Encomendas e Reputação da Guilda dos Aventureiros") — ciclo PRÓPRIO
// de 4h, deliberadamente separado do ROTACAO_MS (6h) dos contratos de
// Rank acima: não reaproveitar inicioDaJanelaAtual pras encomendas,
// senão as duas rotações ficariam acopladas por engano.
// ---------------------------------------------------------------------
const SPOIL_ORDER_ROTATION_HOURS = 4;
const SPOIL_ORDER_ROTATION_MS = SPOIL_ORDER_ROTATION_HOURS * 60 * 60 * 1000;
const SPOIL_ORDERS_PER_ROTATION = 5;
const SPOIL_ORDER_REPUTATION = 5;
const SPOIL_ORDER_SET_BONUS_REPUTATION = 25;

function inicioDaJanelaDeEncomendas(agora = new Date()) {
  return new Date(Math.floor(agora.getTime() / SPOIL_ORDER_ROTATION_MS) * SPOIL_ORDER_ROTATION_MS);
}

// §6.1 — 5 níveis permanentes de Reputação. Limites deliberadamente
// altos (o nível V em 35.500 pontos leva ~119 dias mesmo completando
// 5/5 em toda janela de 4h, sem parar) — é progressão de longuíssimo
// prazo, não algo alcançável em poucos dias. `minimo` é o piso
// (inclusive) de pontos pra alcançar aquele nível.
const SPOIL_REPUTATION_LEVELS = [
  { nivel: 1, roman: "I", nome: "Desconhecido", minimo: 0, multiplicador: 1.2, bonusFaixa: [0.1, 0.2] },
  { nivel: 2, roman: "II", nome: "Reconhecido", minimo: 2000, multiplicador: 1.3, bonusFaixa: [0.15, 0.25] },
  { nivel: 3, roman: "III", nome: "Confiável", minimo: 7000, multiplicador: 1.42, bonusFaixa: [0.2, 0.3] },
  { nivel: 4, roman: "IV", nome: "Prestigiado", minimo: 17000, multiplicador: 1.55, bonusFaixa: [0.25, 0.4] },
  { nivel: 5, roman: "V", nome: "Renomado", minimo: 35500, multiplicador: 1.7, bonusFaixa: [0.35, 0.5] },
];

// §5.3 — faixa de quantidade exigida por encomenda, sorteada por
// raridade do espólio (mesmos valores de Item.raridade).
const SPOIL_ORDER_QUANTITY_RANGES = {
  Comum: [12, 25],
  Incomum: [8, 18],
  Raro: [5, 12],
  Epico: [3, 8],
  Lendario: [2, 5],
  Mitico: [1, 3],
};

module.exports = {
  RANKS_AVENTUREIRO,
  indiceDoRankAventureiro,
  proximoRankAventureiro,
  ehRankAventureiroValido,
  OFERTAS_POR_ROTACAO,
  CONTRATOS_ATIVOS_MAX,
  ROTACAO_HORAS,
  ROTACAO_MS,
  inicioDaJanelaAtual,
  inicioDoCicloDiario,
  inicioDoCicloSemanal,
  inicioDoCicloMensal,
  fimDoCicloAtual,
  COOLDOWN_PROVACAO_MS,
  REQUISITOS_PROMOCAO,
  SPOIL_ORDER_ROTATION_HOURS,
  SPOIL_ORDER_ROTATION_MS,
  SPOIL_ORDERS_PER_ROTATION,
  SPOIL_ORDER_REPUTATION,
  SPOIL_ORDER_SET_BONUS_REPUTATION,
  inicioDaJanelaDeEncomendas,
  SPOIL_REPUTATION_LEVELS,
  SPOIL_ORDER_QUANTITY_RANGES,
};
