// Sorteio da natureza mágica de um personagem novo — sempre no
// servidor, nunca a partir do que o cliente mandar no corpo da
// requisição (senão qualquer um garantia a natureza rara só mandando
// o valor certo). Fogo/Agua/Terra/Ar/Luz são comuns e dividem 90% do
// peso igualmente entre si (18% cada); Yin&Yang/Escuridao/Raio são
// raras e dividem os 10% restantes (3.3333...% cada).
const NATUREZAS_COMUNS = ["Fogo", "Agua", "Terra", "Ar", "Luz"];
const NATUREZAS_RARAS = ["Yin&Yang", "Escuridao", "Raio"];

const PESO_TOTAL_RARAS = 10;
const PESO_TOTAL_COMUNS = 100 - PESO_TOTAL_RARAS;
const PESO_POR_RARA = PESO_TOTAL_RARAS / NATUREZAS_RARAS.length;
const PESO_POR_COMUM = PESO_TOTAL_COMUNS / NATUREZAS_COMUNS.length;

function sortearNaturezaMagica() {
  const roll = Math.random() * 100;
  let acumulado = 0;

  for (const natureza of NATUREZAS_RARAS) {
    acumulado += PESO_POR_RARA;
    if (roll < acumulado) return natureza;
  }
  for (const natureza of NATUREZAS_COMUNS) {
    acumulado += PESO_POR_COMUM;
    if (roll < acumulado) return natureza;
  }
  // Só cai aqui por arredondamento de ponto flutuante bem na borda —
  // devolve a última comum em vez de deixar undefined passar.
  return NATUREZAS_COMUNS[NATUREZAS_COMUNS.length - 1];
}

module.exports = {
  NATUREZAS_COMUNS,
  NATUREZAS_RARAS,
  sortearNaturezaMagica,
};
