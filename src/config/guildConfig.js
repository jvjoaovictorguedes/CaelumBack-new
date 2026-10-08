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
// inicial, a calibrar depois com dados reais de conclusão). Objeto
// mutável em-lugar (Object.assign em aplicarOverridesBalanceamento) —
// mesmo padrão de expeditionConfig.js/forgeConfig.js: nunca reatribuir
// o binding do módulo, senão quem já desestruturou essa tabela no load
// (ex.: `const { REQUISITOS_RANK_GUILDA } = require(...)`) fica preso
// no valor antigo pra sempre.
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
let CARENCIA_NOVO_MEMBRO_MS = 24 * 60 * 60 * 1000;

function membroEmCarencia(guildMember, agora = new Date()) {
  if (!guildMember?.data_entrada) return false;
  // O Fundador nunca "entrou" numa guilda já existente pra farmar
  // recompensa — ele É a origem dela. Sem essa exceção, uma guilda com
  // só o líder (nenhum segundo membro ainda) não progride missão
  // nenhuma nas primeiras 24h depois de criada, porque data_entrada do
  // Fundador é o próprio momento da criação — bug reportado: "só conta
  // depois que entra um segundo membro" (na real, era só o relógio de
  // 24h que não tinha passado ainda).
  if (guildMember.cargo === "Fundador") return false;
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
  // Tesouro V2 §17.1 — teto SEMANAL de pontos vindos só de doação de
  // ouro (proteção contra "comprar atividade"). O ouro continua sendo
  // doado normalmente acima do teto — só os PONTOS extras da semana
  // param de contar (checado em guildContributionService somando
  // GuildContributionEvent.source_type=GOLD_DONATION do ciclo atual).
  DoacaoTetoPontosSemanal: 200,
};

// Tesouro V2 §4.2 — capacidade de slots do Armazém, por MARCO de nível
// da guilda (nunca hardcoded num componente de frontend). Degrau: vale
// o maior marco com nivel <= nível atual da guilda. Tabela mutável
// em-lugar (mesmo padrão de REQUISITOS_RANK_GUILDA acima) pra admin
// poder recalibrar sem deploy.
const CAPACIDADE_TESOURO_POR_NIVEL = {
  1: 30,
  5: 40,
  10: 50,
  15: 60,
  20: 75,
  25: 100,
};

// Única função central que calcula capacidade efetiva — nunca duplicar
// essa conta no controller/frontend (spec §4.2: "deve existir uma única
// função central para calcular capacidade efetiva").
function capacidadeTesouroEfetiva(nivelGuilda) {
  const marcos = Object.keys(CAPACIDADE_TESOURO_POR_NIVEL)
    .map(Number)
    .sort((a, b) => a - b);
  let capacidade = CAPACIDADE_TESOURO_POR_NIVEL[marcos[0]];
  for (const marco of marcos) {
    if (nivelGuilda >= marco) capacidade = CAPACIDADE_TESOURO_POR_NIVEL[marco];
  }
  return capacidade;
}

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
let XP_GUILDA_MISSAO_RANK_MIN = 40;
let XP_GUILDA_MISSAO_RANK_MAX = 300;

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
let BOSS_FRACAO_IGUALITARIA = 0.25;
let BOSS_FRACAO_PROPORCIONAL = 0.75;

// Boss da Guilda V2.0 — batalha em tempo real (guildBossSocket.js),
// mesmo modelo de turnos da Aventura em grupo (partySocket.js): grupo
// pequeno, cada um ataca na sua vez, o boss revida 1 alvo aleatório por
// rodada. A vida do boss em si continua sendo a MESMA vida_restante
// persistida da tentativa da semana — várias salas ao vivo diferentes
// (grupos distintos de membros) podem golpear o mesmo boss em paralelo,
// cada golpe é salvo na hora.
let BOSS_AO_VIVO_TAMANHO_MAXIMO = 8;
let BOSS_AO_VIVO_TAMANHO_MINIMO = 1;
let BOSS_AO_VIVO_PRAZO_TURNO_MS = 20 * 1000;
// Dano do boss começa em dano_base_ataque (rodada 1) e cresce por
// rodada — "ataques fracos que vão aumentando com o passar dos turnos",
// pedido do jogador. Buff leve (0.15 -> 0.20): rodada 5 já bate ~1.8x
// mais forte que a 1ª em vez de ~1.6x, sem virar parede logo de cara.
let BOSS_AO_VIVO_FATOR_ESCALADA_DANO = 0.2;
let BOSS_AO_VIVO_MAX_RODADAS = 60;
// "Ritmo de turno" do chefe (pedido do jogador: igual à Ameaça Mundial)
// — pausa MÍNIMA sempre respeitada antes do contra-ataque do chefe
// resolver, mesmo sem nenhuma habilidade escolhida (telegraph). Sem
// isso, "turno do chefe" virava só o round-trip da rede: o dano
// aparecia instantaneamente, sem nenhuma pausa perceptível entre o fim
// do seu golpe e o contra-ataque, diferente de todo outro combate do
// jogo. Guild Boss nunca compara isto com worldboss.player_action_cooldown_ms
// (mundos de config diferentes — ver worldBossConfig.js), só reaproveita
// o MESMO espírito.
let BOSS_AO_VIVO_TELEGRAPH_MS = 1500;

// §31 — 1 boss por semana, ciclo global semanal (mesma semana UTC usada
// pelas missões Semanais de personagem/guilda).
const {
  inicioDoCicloSemanal,
  inicioDoCicloDiario,
  inicioDoCicloMensal,
  fimDoCicloAtual,
} = require("./adventureGuildConfig");

// ---------------------------------------------------------------------
// PAINEL ADMINISTRATIVO — hot-reload de balanceamento (mesmo padrão de
// expeditionConfig.aplicarOverridesBalanceamento/forgeConfig.*: aplica
// overrides já VALIDADOS por cima destes defaults, sempre por mutação
// em-lugar dos objetos já exportados — nunca reatribuindo o binding do
// módulo — porque guildBossService/guildMissionService/guildBuffService/
// guildContributionService já desestruturaram essas tabelas no load;
// primitivos (CARENCIA_NOVO_MEMBRO_MS, XP_GUILDA_MISSAO_RANK_MIN/MAX,
// BOSS_FRACAO_*, BOSS_AO_VIVO_*) exigem module.exports.<chave> também,
// já que destructuring de número não acompanha mutação — guildBossService.js
// e guildBossSocket.js foram ajustados pra ler os BOSS_* via
// guildConfig.<chave> (nunca desestruturado) por causa disso.
function aplicarOverridesBalanceamento(grupo, valores) {
  if (!valores || typeof valores !== "object") return;
  switch (grupo) {
    case "guild.ranks": {
      Object.assign(REQUISITOS_RANK_GUILDA, valores);
      break;
    }
    case "guild.carencia": {
      if (typeof valores.CARENCIA_NOVO_MEMBRO_MS === "number") {
        CARENCIA_NOVO_MEMBRO_MS = valores.CARENCIA_NOVO_MEMBRO_MS;
        module.exports.CARENCIA_NOVO_MEMBRO_MS = CARENCIA_NOVO_MEMBRO_MS;
      }
      break;
    }
    case "guild.buffs": {
      for (const tipo of BUFF_TIPOS) {
        if (!valores[tipo]) continue;
        for (const [nivel, tabela] of Object.entries(valores[tipo])) {
          BUFF_NIVEIS[tipo][nivel] = { ...BUFF_NIVEIS[tipo][nivel], ...tabela };
        }
      }
      break;
    }
    case "guild.tesouro": {
      if (valores.CAPACIDADE_TESOURO_POR_NIVEL) {
        Object.assign(CAPACIDADE_TESOURO_POR_NIVEL, valores.CAPACIDADE_TESOURO_POR_NIVEL);
      }
      break;
    }
    case "guild.contribuicao": {
      if (valores.PONTOS_CONTRIBUICAO) Object.assign(PONTOS_CONTRIBUICAO, valores.PONTOS_CONTRIBUICAO);
      if (typeof valores.XP_GUILDA_MISSAO_RANK_MIN === "number") {
        XP_GUILDA_MISSAO_RANK_MIN = valores.XP_GUILDA_MISSAO_RANK_MIN;
        module.exports.XP_GUILDA_MISSAO_RANK_MIN = XP_GUILDA_MISSAO_RANK_MIN;
      }
      if (typeof valores.XP_GUILDA_MISSAO_RANK_MAX === "number") {
        XP_GUILDA_MISSAO_RANK_MAX = valores.XP_GUILDA_MISSAO_RANK_MAX;
        module.exports.XP_GUILDA_MISSAO_RANK_MAX = XP_GUILDA_MISSAO_RANK_MAX;
      }
      break;
    }
    case "guild.boss": {
      if (typeof valores.BOSS_FRACAO_IGUALITARIA === "number") {
        BOSS_FRACAO_IGUALITARIA = valores.BOSS_FRACAO_IGUALITARIA;
        module.exports.BOSS_FRACAO_IGUALITARIA = BOSS_FRACAO_IGUALITARIA;
      }
      if (typeof valores.BOSS_FRACAO_PROPORCIONAL === "number") {
        BOSS_FRACAO_PROPORCIONAL = valores.BOSS_FRACAO_PROPORCIONAL;
        module.exports.BOSS_FRACAO_PROPORCIONAL = BOSS_FRACAO_PROPORCIONAL;
      }
      if (typeof valores.BOSS_AO_VIVO_TAMANHO_MAXIMO === "number") {
        BOSS_AO_VIVO_TAMANHO_MAXIMO = valores.BOSS_AO_VIVO_TAMANHO_MAXIMO;
        module.exports.BOSS_AO_VIVO_TAMANHO_MAXIMO = BOSS_AO_VIVO_TAMANHO_MAXIMO;
      }
      if (typeof valores.BOSS_AO_VIVO_TAMANHO_MINIMO === "number") {
        BOSS_AO_VIVO_TAMANHO_MINIMO = valores.BOSS_AO_VIVO_TAMANHO_MINIMO;
        module.exports.BOSS_AO_VIVO_TAMANHO_MINIMO = BOSS_AO_VIVO_TAMANHO_MINIMO;
      }
      if (typeof valores.BOSS_AO_VIVO_PRAZO_TURNO_MS === "number") {
        BOSS_AO_VIVO_PRAZO_TURNO_MS = valores.BOSS_AO_VIVO_PRAZO_TURNO_MS;
        module.exports.BOSS_AO_VIVO_PRAZO_TURNO_MS = BOSS_AO_VIVO_PRAZO_TURNO_MS;
      }
      if (typeof valores.BOSS_AO_VIVO_FATOR_ESCALADA_DANO === "number") {
        BOSS_AO_VIVO_FATOR_ESCALADA_DANO = valores.BOSS_AO_VIVO_FATOR_ESCALADA_DANO;
        module.exports.BOSS_AO_VIVO_FATOR_ESCALADA_DANO = BOSS_AO_VIVO_FATOR_ESCALADA_DANO;
      }
      if (typeof valores.BOSS_AO_VIVO_MAX_RODADAS === "number") {
        BOSS_AO_VIVO_MAX_RODADAS = valores.BOSS_AO_VIVO_MAX_RODADAS;
        module.exports.BOSS_AO_VIVO_MAX_RODADAS = BOSS_AO_VIVO_MAX_RODADAS;
      }
      if (typeof valores.BOSS_AO_VIVO_TELEGRAPH_MS === "number") {
        BOSS_AO_VIVO_TELEGRAPH_MS = valores.BOSS_AO_VIVO_TELEGRAPH_MS;
        module.exports.BOSS_AO_VIVO_TELEGRAPH_MS = BOSS_AO_VIVO_TELEGRAPH_MS;
      }
      break;
    }
    default:
      break;
  }
}

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
  CAPACIDADE_TESOURO_POR_NIVEL,
  capacidadeTesouroEfetiva,
  pontosMissaoRank,
  xpGuildaMissaoRank,
  BOSS_FRACAO_IGUALITARIA,
  BOSS_FRACAO_PROPORCIONAL,
  BOSS_AO_VIVO_TAMANHO_MAXIMO,
  BOSS_AO_VIVO_TAMANHO_MINIMO,
  BOSS_AO_VIVO_PRAZO_TURNO_MS,
  BOSS_AO_VIVO_FATOR_ESCALADA_DANO,
  BOSS_AO_VIVO_MAX_RODADAS,
  BOSS_AO_VIVO_TELEGRAPH_MS,
  XP_GUILDA_MISSAO_RANK_MIN,
  XP_GUILDA_MISSAO_RANK_MAX,
  aplicarOverridesBalanceamento,
  // Reexportados por conveniência — mesma fonte de verdade de ciclos
  // globais já usada pela Guilda dos Aventureiros/Missões livres (§9 do
  // documento novo pede exatamente os mesmos resets globais).
  inicioDoCicloSemanal,
  inicioDoCicloDiario,
  inicioDoCicloMensal,
  fimDoCicloAtual,
};
