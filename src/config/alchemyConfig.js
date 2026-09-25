// src/config/alchemyConfig.js
//
// Configuração central da Alquimia/Caldeirão (spec §8/§16) — todos os
// números de progressão/lote moram aqui, nunca espalhados em services.
// Progressão própria e independente da Forja (mesmo padrão de curva de
// forgeConfig.js, valores próprios).

const NIVEL_MAXIMO = 25;

// XP necessário para SUBIR de cada etapa (1->2, 2->3, ...) — curva
// suave, alinhada às faixas de conteúdo da spec §8 (1-4 básico, 5-9
// antídotos, 10-14 preparados superiores, 15-19 elixires raros, 20-25
// endgame).
const XP_NECESSARIO_POR_ETAPA = {
  1: 80, 2: 150, 3: 240, 4: 350,
  5: 480, 6: 630, 7: 800, 8: 990, 9: 1200,
  10: 1450, 11: 1720, 12: 2020, 13: 2350, 14: 2700,
  15: 3200, 16: 3750, 17: 4350, 18: 5000, 19: 5700,
  20: 6800, 21: 8000, 22: 9300, 23: 10700, 24: 12200,
};

// XP TOTAL acumulado pra ALCANÇAR cada nível — nunca decrementado/zerado
// (mesmo critério de forgeProgressionService.js/expeditionProgressionService.js).
const XP_TOTAL_PARA_NIVEL = { 1: 0 };
for (let nivel = 2; nivel <= NIVEL_MAXIMO; nivel += 1) {
  XP_TOTAL_PARA_NIVEL[nivel] = XP_TOTAL_PARA_NIVEL[nivel - 1] + XP_NECESSARIO_POR_ETAPA[nivel - 1];
}

// Limite de unidades por request de brew (spec §15: "Limite configurável
// por request (ex.: 99) para evitar payload/transaction abusivos").
const QUANTIDADE_MAXIMA_POR_BREW = 99;

// Categorias válidas de receita (espelha o ENUM da migration — mantido
// aqui também pra validação de payload/admin sem precisar consultar o
// banco).
const CATEGORIAS_RECEITA = ["POCAO", "ANTIDOTO", "TONICO", "ELIXIR", "PREPARADO"];

const MODOS_DESBLOQUEIO = ["NIVEL", "DESCOBERTA"];

module.exports = {
  NIVEL_MAXIMO,
  XP_TOTAL_PARA_NIVEL,
  QUANTIDADE_MAXIMA_POR_BREW,
  CATEGORIAS_RECEITA,
  MODOS_DESBLOQUEIO,
};
