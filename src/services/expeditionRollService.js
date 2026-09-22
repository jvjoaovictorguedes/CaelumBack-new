// Sorteios da Expedição — sempre crypto.randomInt (nunca Math.random)
// pra qualidade/recurso, seguindo o mesmo critério já usado em
// dropService/raridadeRolagemService: é "vale a pena tentar prever/
// manipular".
const crypto = require("crypto");
const {
  BASE_SORTEIO,
  CHANCE_POR_NIVEL_PPM,
  QUANTIDADE_POR_NIVEL,
  aplicarTetoDeQualidade,
  CHANCE_MONSTRO_PPM,
} = require("../config/expeditionConfig");

// Ordem da mais rara pra mais comum — soma cumulativa checando a mais
// rara primeiro garante que a faixa pequena do Mítico não fique
// "engolida" por engano dentro da faixa grande do Comum.
const ORDEM_RARIDADE_DESC = ["Mitico", "Lendario", "Epico", "Raro", "Incomum", "Comum"];

// Retorna a qualidade sorteada, ou null se "nada encontrado" — nunca
// aceitar esse valor vindo do cliente (ver seção 15 da spec).
function sortearQualidade(nivel) {
  const chances = CHANCE_POR_NIVEL_PPM[nivel];
  if (!chances) {
    throw new Error(`Nível de profissão sem tabela de chance configurada: ${nivel}`);
  }

  const sorteio = crypto.randomInt(0, BASE_SORTEIO);
  let acumulado = 0;
  for (const qualidade of ORDEM_RARIDADE_DESC) {
    acumulado += chances[qualidade] ?? 0;
    if (sorteio < acumulado) return qualidade;
  }
  return null;
}

// Escolhe 1 recurso entre os possíveis da região, por peso relativo.
// `recursos` é [{ id_recurso, peso, ... }].
function sortearRecurso(recursos) {
  const pesoTotal = recursos.reduce((soma, r) => soma + r.peso, 0);
  if (pesoTotal <= 0) return null;

  let alvo = crypto.randomInt(0, pesoTotal);
  for (const recurso of recursos) {
    alvo -= recurso.peso;
    if (alvo < 0) return recurso;
  }
  return recursos[recursos.length - 1];
}

// Quantidade final já com o teto de qualidade aplicado.
function sortearQuantidade(nivel, qualidade) {
  const [minimo, maximo] = QUANTIDADE_POR_NIVEL[nivel] ?? [1, 1];
  const base = minimo === maximo ? minimo : crypto.randomInt(minimo, maximo + 1);
  return aplicarTetoDeQualidade(base, qualidade);
}

// Rola se ESTA coleta vira uma interrupção de monstro em vez do sorteio
// normal de qualidade/recurso (ver expeditionService.coletar) — sempre
// checado ANTES de sortearQualidade, nunca em conjunto (uma coleta ou
// gera recurso ou vira combate, nunca os dois).
function sortearInterrupcaoDeMonstro() {
  return crypto.randomInt(0, BASE_SORTEIO) < CHANCE_MONSTRO_PPM;
}

module.exports = { sortearQualidade, sortearRecurso, sortearQuantidade, sortearInterrupcaoDeMonstro };
