// Configuração central do sistema de Expedição — toda a matemática de
// progressão/sorteio mora aqui, não espalhada pelos services/
// controllers, pra dar pra rebalancear sem caçar número por arquivo
// (ver especificação, seções 3/4/8/10/13/14/28).

const NIVEL_MAXIMO = 10;

// XP TOTAL acumulado necessário para TER alcançado cada nível (nunca
// decrementado nem zerado — ver expeditionProgressionService.js).
// XP_NECESSARIO_POR_ETAPA[n] = custo pra sair do nível n pro n+1.
const XP_NECESSARIO_POR_ETAPA = {
  1: 120,
  2: 300,
  3: 650,
  4: 1200,
  5: 2400,
  6: 4800,
  7: 8500,
  8: 14000,
  9: 22000,
};

// Derivado uma vez na carga do módulo: XP_TOTAL_PARA_NIVEL[n] = soma
// acumulada de XP pra ALCANÇAR o nível n (nível 1 = 0 XP).
const XP_TOTAL_PARA_NIVEL = { 1: 0 };
for (let nivel = 2; nivel <= NIVEL_MAXIMO; nivel += 1) {
  XP_TOTAL_PARA_NIVEL[nivel] = XP_TOTAL_PARA_NIVEL[nivel - 1] + XP_NECESSARIO_POR_ETAPA[nivel - 1];
}

// XP ganho por tentativa, mesmo sem coleta — evita que azar puro
// impeça progressão (seção 4).
const XP_POR_RESULTADO = {
  Nada: 1,
  Comum: 2,
  Incomum: 2,
  Raro: 3,
  Epico: 4,
  Lendario: 6,
  Mitico: 10,
};

// Chance por tentativa, em partes por milhão (BASE = 1_000_000) pra
// evitar imprecisão de float — ver seção 8. O que sobra depois de
// somar todas as qualidades é a chance de "nada encontrado".
const BASE_SORTEIO = 1_000_000;

const CHANCE_POR_NIVEL_PPM = {
  1: { Comum: 350_000, Incomum: 50_000, Raro: 0, Epico: 0, Lendario: 0, Mitico: 0 },
  2: { Comum: 360_000, Incomum: 60_000, Raro: 2_500, Epico: 0, Lendario: 0, Mitico: 0 },
  3: { Comum: 370_000, Incomum: 75_000, Raro: 5_000, Epico: 0, Lendario: 0, Mitico: 0 },
  4: { Comum: 380_000, Incomum: 90_000, Raro: 9_000, Epico: 500, Lendario: 0, Mitico: 0 },
  5: { Comum: 390_000, Incomum: 105_000, Raro: 14_000, Epico: 1_200, Lendario: 0, Mitico: 0 },
  6: { Comum: 400_000, Incomum: 120_000, Raro: 20_000, Epico: 2_500, Lendario: 200, Mitico: 0 },
  7: { Comum: 400_000, Incomum: 135_000, Raro: 28_000, Epico: 4_500, Lendario: 500, Mitico: 0 },
  8: { Comum: 400_000, Incomum: 150_000, Raro: 38_000, Epico: 7_000, Lendario: 900, Mitico: 50 },
  9: { Comum: 400_000, Incomum: 165_000, Raro: 48_000, Epico: 10_000, Lendario: 1_600, Mitico: 150 },
  10: { Comum: 400_000, Incomum: 180_000, Raro: 60_000, Epico: 15_000, Lendario: 3_000, Mitico: 400 },
};

// Faixa [min, max] de quantidade sorteada por nível, antes do teto por
// qualidade (seção 10).
const QUANTIDADE_POR_NIVEL = {
  1: [1, 1],
  2: [1, 1],
  3: [1, 2],
  4: [1, 2],
  5: [1, 3],
  6: [2, 3],
  7: [2, 4],
  8: [2, 5],
  9: [3, 5],
  10: [3, 6],
};

// Teto aplicado sobre a quantidade sorteada, por qualidade. Mítico
// SEMPRE 1 — nunca deixar sair 5-6 míticos numa coleta só (seção 10).
function aplicarTetoDeQualidade(quantidadeBase, qualidade) {
  switch (qualidade) {
    case "Mitico":
      return 1;
    case "Lendario":
      return Math.min(quantidadeBase, 2);
    case "Epico":
      return Math.max(1, Math.round(quantidadeBase * 0.5));
    case "Raro":
      return Math.max(1, Math.round(quantidadeBase * 0.75));
    default:
      return quantidadeBase;
  }
}

// Duração mínima entre duas coletas, em ms — persistida no banco
// (character_professions.proxima_coleta_em), não em memória (seção 14).
// GLOBAL entre as 3 profissões (pedido do jogador): coletar em Mineração
// também bloqueia Silvicultura/Exploração pelo mesmo tempo, não só a
// Mineração — expeditionService.coletar() grava o mesmo cooldown nas 3
// linhas de character_professions de uma vez.
//
// Baixado pra 3s a pedido do jogador pra agilizar teste no beta —
// reverter pra um valor de produção antes do lançamento de verdade.
const TEMPO_COLETA_MS = 3000;

module.exports = {
  NIVEL_MAXIMO,
  XP_NECESSARIO_POR_ETAPA,
  XP_TOTAL_PARA_NIVEL,
  XP_POR_RESULTADO,
  BASE_SORTEIO,
  CHANCE_POR_NIVEL_PPM,
  QUANTIDADE_POR_NIVEL,
  aplicarTetoDeQualidade,
  TEMPO_COLETA_MS,
};
