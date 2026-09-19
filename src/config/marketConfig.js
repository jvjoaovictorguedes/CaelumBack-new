// Configuração central do Mercado P2P (spec v2 §8/§15) — taxa e limites
// de preço viviam como const solta dentro de marketController.js antes;
// centralizados aqui pra nunca ter dois lugares divergindo, e pra dar
// um único ponto de ajuste se o balanceamento da economia mudar.
module.exports = {
  // 8% fica pelo caminho a cada venda — dreno de ouro padrão de MMO pra
  // segurar a inflação de uma economia onde jogador também gera ouro
  // puro (drop, missão). O vendedor recebe o resto; ninguém "recebe" a
  // taxa, ela só desaparece da economia (ver goldService.js).
  TAXA_MERCADO: 0.08,
  PRECO_MINIMO_UNITARIO: 1,
  PRECO_MAXIMO_UNITARIO: 1_000_000,
  // Paginação server-side (spec §10) — o frontend nunca deve pedir o
  // Mercado inteiro pra filtrar localmente.
  LIMITE_PAGINA_PADRAO: 30,
  LIMITE_PAGINA_MAXIMO: 100,
};
