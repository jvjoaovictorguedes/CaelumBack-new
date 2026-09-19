// Configuração central do Ranking v2 (§10/§19 da spec) — paginação e
// fórmula de Pontuação PvP centralizadas aqui, nunca espalhadas pelos
// services/controllers.
const TAMANHO_PAGINA_PADRAO = 50;

const PVP_MINIMO_COMBATES = 10;
const PVP_BONUS_ATIVIDADE_MAXIMO = 30;
const PVP_DIVISOR_BONUS_ATIVIDADE = 5;
const PVP_PESO_SALDO = 10;

module.exports = {
  TAMANHO_PAGINA_PADRAO,
  PVP_MINIMO_COMBATES,
  PVP_BONUS_ATIVIDADE_MAXIMO,
  PVP_DIVISOR_BONUS_ATIVIDADE,
  PVP_PESO_SALDO,
};
