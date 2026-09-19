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
};
