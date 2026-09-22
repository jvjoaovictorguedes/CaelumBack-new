// Configuração central do Aprimoramento de Guildas (spec "Aprimoramento
// do Sistema de Guildas — Caelum") — nenhum número de balanceamento
// espalhado por controller/service, só aqui.
//
// RANK DA GUILDA: nova escada PRÓPRIA F..S (sem S+/S++, spec §4/§13),
// substitui o uso de rankService.js (F..S++) que era compartilhado com
// Character.rank e com o antigo Portal de Guilda. Igual à escada de
// CharacterAdventureGuildProgress (F..S) só que são eixos DIFERENTES —
// não reaproveita o módulo de lá de propósito, pra não criar uma
// dependência cruzada entre "Guilda dos Aventureiros" (progressão do
// personagem) e "Guilda" (progressão coletiva).
const RANKS_GUILDA = ["F", "E", "D", "C", "B", "A", "S"];

function indiceDoRankGuilda(rank) {
  return RANKS_GUILDA.indexOf(rank);
}

function proximoRankGuilda(rank) {
  const indice = indiceDoRankGuilda(rank);
  if (indice === -1 || indice >= RANKS_GUILDA.length - 1) return null;
  return RANKS_GUILDA[indice + 1];
}

function ehRankGuildaValido(rank) {
  return indiceDoRankGuilda(rank) !== -1;
}

// §14 — requisitos de promoção configuráveis (valores de referência
// inicial, a calibrar depois com dados reais de conclusão).
const REQUISITOS_RANK_GUILDA = {
  F: 20,
  E: 35,
  D: 55,
  C: 80,
  B: 110,
  A: 150,
  // S não promove — é o topo (§32/§67 do documento novo).
};

// §26 — carência anti-exploit: membro recém-entrado não gera XP de
// Missões, não conta pra progresso de Rank, não recebe recompensa do
// Boss nem benefícios econômicos dos Buffs (§27: mesma carência pros
// dois, pra simplificar a v1).
const CARENCIA_NOVO_MEMBRO_MS = 24 * 60 * 60 * 1000;

function membroEmCarencia(guildMember, agora = new Date()) {
  if (!guildMember?.data_entrada) return false;
  return agora.getTime() - new Date(guildMember.data_entrada).getTime() < CARENCIA_NOVO_MEMBRO_MS;
}

// §19/§20/§21 — Buffs: 3 tipos, níveis 1-5, bônus TOTAL por nível (não
// cumulativo), custo em Gold do Tesouro e Nível de Guilda mínimo (§23).
const BUFF_TIPOS = ["XP", "GOLD", "FORJA"];
const NIVEL_MAXIMO_BUFF = 5;

const BUFF_NIVEIS = {
  XP: {
    1: { bonusPercentual: 2, custo: 500000, nivelGuildaMinimo: 2 },
    2: { bonusPercentual: 3, custo: 1500000, nivelGuildaMinimo: 5 },
    3: { bonusPercentual: 4, custo: 4000000, nivelGuildaMinimo: 8 },
    4: { bonusPercentual: 5, custo: 10000000, nivelGuildaMinimo: 12 },
    5: { bonusPercentual: 7, custo: 25000000, nivelGuildaMinimo: 16 },
  },
  GOLD: {
    1: { bonusPercentual: 2, custo: 500000, nivelGuildaMinimo: 2 },
    2: { bonusPercentual: 3, custo: 1500000, nivelGuildaMinimo: 5 },
    3: { bonusPercentual: 4, custo: 4000000, nivelGuildaMinimo: 8 },
    4: { bonusPercentual: 5, custo: 10000000, nivelGuildaMinimo: 12 },
    5: { bonusPercentual: 7, custo: 25000000, nivelGuildaMinimo: 16 },
  },
  // §21/§22 — Forja: bônus em PONTOS PERCENTUAIS retirados só do
  // resultado "mesma qualidade" e transferidos pra "+1 qualidade";
  // +2/+3/+4/+5 permanecem iguais. Nunca aplica em Refinamento/Fundição/
  // Pergaminhos.
  FORJA: {
    1: { bonusPontosPercentuais: 1, custo: 500000, nivelGuildaMinimo: 2 },
    2: { bonusPontosPercentuais: 2, custo: 1500000, nivelGuildaMinimo: 5 },
    3: { bonusPontosPercentuais: 3, custo: 4000000, nivelGuildaMinimo: 8 },
    4: { bonusPontosPercentuais: 4, custo: 10000000, nivelGuildaMinimo: 12 },
    5: { bonusPontosPercentuais: 5, custo: 25000000, nivelGuildaMinimo: 16 },
  },
};

// §44 — pontuação de Contribuição (referência inicial, tudo configurável).
const PONTOS_CONTRIBUICAO = {
  MissaoDiaria: 10,
  MissaoSemanal: 50,
  MissaoMensal: 200,
  // Rank baixo/alto: interpolado linearmente pela posição na escada
  // RANKS_GUILDA (F..S) entre os extremos abaixo (§44: "+20 a +40" pros
  // baixos, "+80 a +150" pros altos — aqui unificado numa única faixa
  // contínua F->S pra não precisar de um segundo corte arbitrário).
  MissaoRankMin: 20,
  MissaoRankMax: 150,
  // Boss: base fixa + componente proporcional à participação de dano
  // (0..1) na tentativa.
  BossBase: 50,
  BossPorParticipacaoDano: 200,
  // Doação: pontuação normalizada (não o Gold cru) — 1 ponto a cada
  // 10.000 de ouro doado, com teto por doação pra não virar "comprar
  // contribuição" ilimitadamente.
  DoacaoPorOuro: 1 / 10000,
  DoacaoTetoPorDoacao: 50,
};

function pontosMissaoRank(rank) {
  const indice = indiceDoRankGuilda(rank);
  if (indice === -1) return PONTOS_CONTRIBUICAO.MissaoRankMin;
  const fracao = indice / (RANKS_GUILDA.length - 1);
  return Math.round(
    PONTOS_CONTRIBUICAO.MissaoRankMin +
      fracao * (PONTOS_CONTRIBUICAO.MissaoRankMax - PONTOS_CONTRIBUICAO.MissaoRankMin),
  );
}

// §12/§65 XP de Missão de Rank da Guilda — mesma ideia (interpolado
// pela posição no rank), valores de referência inicial.
const XP_GUILDA_MISSAO_RANK_MIN = 40;
const XP_GUILDA_MISSAO_RANK_MAX = 300;

function xpGuildaMissaoRank(rank) {
  const indice = indiceDoRankGuilda(rank);
  if (indice === -1) return XP_GUILDA_MISSAO_RANK_MIN;
  const fracao = indice / (RANKS_GUILDA.length - 1);
  return Math.round(
    XP_GUILDA_MISSAO_RANK_MIN + fracao * (XP_GUILDA_MISSAO_RANK_MAX - XP_GUILDA_MISSAO_RANK_MIN),
  );
}

// §33/§34 — Boss: recompensa por dano é 25% dividido igualmente entre
// participantes elegíveis + 75% proporcional à participação de dano.
const BOSS_FRACAO_IGUALITARIA = 0.25;
const BOSS_FRACAO_PROPORCIONAL = 0.75;

// Boss da Guilda V2.0 — batalha em tempo real (guildBossSocket.js),
// mesmo modelo de turnos da Aventura em grupo (partySocket.js): grupo
// pequeno, cada um ataca na sua vez, o boss revida 1 alvo aleatório por
// rodada. A vida do boss em si continua sendo a MESMA vida_restante
// persistida da tentativa da semana — várias salas ao vivo diferentes
// (grupos distintos de membros) podem golpear o mesmo boss em paralelo,
// cada golpe é salvo na hora.
const BOSS_AO_VIVO_TAMANHO_MAXIMO = 8;
const BOSS_AO_VIVO_TAMANHO_MINIMO = 1;
const BOSS_AO_VIVO_PRAZO_TURNO_MS = 20 * 1000;
// Dano do boss começa em dano_base_ataque (rodada 1) e cresce por
// rodada — "ataques fracos que vão aumentando com o passar dos turnos",
// pedido do jogador.
const BOSS_AO_VIVO_FATOR_ESCALADA_DANO = 0.15;
const BOSS_AO_VIVO_MAX_RODADAS = 60;

// §31 — 1 boss por semana, ciclo global semanal (mesma semana UTC usada
// pelas missões Semanais de personagem/guilda).
const {
  inicioDoCicloSemanal,
  inicioDoCicloDiario,
  inicioDoCicloMensal,
  fimDoCicloAtual,
} = require("./adventureGuildConfig");

module.exports = {
  RANKS_GUILDA,
  indiceDoRankGuilda,
  proximoRankGuilda,
  ehRankGuildaValido,
  REQUISITOS_RANK_GUILDA,
  CARENCIA_NOVO_MEMBRO_MS,
  membroEmCarencia,
  BUFF_TIPOS,
  NIVEL_MAXIMO_BUFF,
  BUFF_NIVEIS,
  PONTOS_CONTRIBUICAO,
  pontosMissaoRank,
  xpGuildaMissaoRank,
  BOSS_FRACAO_IGUALITARIA,
  BOSS_FRACAO_PROPORCIONAL,
  BOSS_AO_VIVO_TAMANHO_MAXIMO,
  BOSS_AO_VIVO_TAMANHO_MINIMO,
  BOSS_AO_VIVO_PRAZO_TURNO_MS,
  BOSS_AO_VIVO_FATOR_ESCALADA_DANO,
  BOSS_AO_VIVO_MAX_RODADAS,
  // Reexportados por conveniência — mesma fonte de verdade de ciclos
  // globais já usada pela Guilda dos Aventureiros/Missões livres (§9 do
  // documento novo pede exatamente os mesmos resets globais).
  inicioDoCicloSemanal,
  inicioDoCicloDiario,
  inicioDoCicloMensal,
  fimDoCicloAtual,
};
