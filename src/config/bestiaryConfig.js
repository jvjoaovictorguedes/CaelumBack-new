// Configuração central do Bestiário e Maestria Regional (§26 da spec)
// — requisitos de abate e bônus regionais ficam só aqui, nunca
// espalhados por controller/service.
const NIVEL_MAXIMO_MAESTRIA = 5;

// Maestria I não usa este mapa — é concedida automaticamente ao
// descobrir (derrotar 1x) todos os monstros da região (§10). II-V usam
// requisito ACUMULADO de abates (§11), nunca adicional, e o Raro
// sempre exige bem menos que o Comum (§12) por causa da chance de
// aparição menor.
const REQUISITOS_ABATES_POR_NIVEL = {
  2: { Comum: 30, Raro: 5 },
  3: { Comum: 70, Raro: 8 },
  4: { Comum: 120, Raro: 12 },
  5: { Comum: 200, Raro: 20 },
};

// Bônus regionais por nível de Maestria (§14/§15) — pequenos de
// propósito, só ficam ativos DENTRO da região que atingiu aquele
// nível. Nível 0 (bloqueada) e I (só descoberta completa) não dão
// bônus nenhum ainda; a recompensa de completar o Bestiário é
// conhecimento, não poder (§10/§22).
const BONUS_POR_NIVEL = {
  0: { xp: 0, ouro: 0, espolio: 0 },
  1: { xp: 0, ouro: 0, espolio: 0 },
  2: { xp: 0.02, ouro: 0.02, espolio: 0.03 },
  3: { xp: 0.04, ouro: 0.04, espolio: 0.05 },
  4: { xp: 0.05, ouro: 0.05, espolio: 0.07 },
  5: { xp: 0.07, ouro: 0.07, espolio: 0.1 },
};

const NUMERAL_ROMANO = { 0: null, 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V" };

function numeralRomano(nivel) {
  return NUMERAL_ROMANO[nivel] ?? null;
}

module.exports = {
  NIVEL_MAXIMO_MAESTRIA,
  REQUISITOS_ABATES_POR_NIVEL,
  BONUS_POR_NIVEL,
  numeralRomano,
};
