// Torneios (PvP v2 §16) — números de regra centralizados aqui, nunca
// espalhados pelos services/controllers.

// Máximo absoluto da spec. Nesta primeira versão o torneio só INICIA
// com exatamente 4 ou 8 inscritos: a spec permite explicitamente essa
// simplificação ("pode-se exigir 4 ou 8 participantes para simplificar")
// justamente pra não precisar de BYE determinístico já no primeiro
// corte. Contagens 5–7 são recusadas com erro claro.
const MAX_PARTICIPANTES = 8;
const CONTAGENS_VALIDAS_PARA_INICIAR = [4, 8];

// §16 — Final é MD5, todo o resto MD3.
const FORMATO_FINAL = "MD5";
const FORMATO_PADRAO = "MD3";
const VITORIAS_NECESSARIAS = { MD3: 2, MD5: 3 };

// §16 — janela do ready check de cada série. Quem não confirma perde
// por W.O.; se NINGUÉM confirma, a série vai pra resolução de DEV/ADM
// em vez de sortear um vencedor.
const READY_CHECK_SEGUNDOS = 180;

module.exports = {
  MAX_PARTICIPANTES,
  CONTAGENS_VALIDAS_PARA_INICIAR,
  FORMATO_FINAL,
  FORMATO_PADRAO,
  VITORIAS_NECESSARIAS,
  READY_CHECK_SEGUNDOS,
};
