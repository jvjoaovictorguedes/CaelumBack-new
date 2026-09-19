// Concessão central de ouro (§6/§23 da spec de Ranking v2) — TODA fonte
// legítima de ouro (recompensa de combate PvE, PvP, Portal de Ranque,
// missão, drop de ouro bônus) deve passar por aqui, nunca escrever
// `character.dinheiro +=` direto: assim as duas colunas nunca ficam
// dessincronizadas. Transferência entre jogadores (Mercado) NÃO deve
// usar isto — é dinheiro que já existia circulando, não ouro novo (ver
// marketController.js, que continua creditando o vendedor direto).
function concederOuro(character, valor) {
  character.dinheiro += valor;
  character.dinheiro_total_ganho += valor;
}

module.exports = { concederOuro };
