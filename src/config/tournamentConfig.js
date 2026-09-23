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

// Bug reportado: uma série "EmAndamento" (os dois já confirmaram o
// ready check) só ganha um duelo de verdade quando iniciarJogoDaSerie
// roda com sucesso — e ela só roda automaticamente em dois momentos (o
// instante em que a série vira EmAndamento, e 3s depois de cada jogo
// terminar). Se QUALQUER um dos dois estiver momentaneamente offline
// ou preso em outro duelo bem nessa hora (reconexão, troca de aba), a
// tentativa falha silenciosamente e nada mais tenta de novo — a série
// fica presa em EmAndamento pra sempre, e tournamentService.emSerieAtiva
// continua bloqueando ranqueada indefinidamente mesmo sem partida
// nenhuma realmente em andamento. Esse tempo é quanto uma série pode
// ficar "EmAndamento" sem nenhum duelo ativo antes da varredura
// (tournamentSocket.iniciarVarreduraSeriesTravadas) forçar uma
// resolução (W.O. pra quem estiver online, ou PendenteAdm se nenhum
// dos dois estiver).
const JOGO_TRAVADO_SEGUNDOS = 300;

module.exports = {
  MAX_PARTICIPANTES,
  CONTAGENS_VALIDAS_PARA_INICIAR,
  FORMATO_FINAL,
  FORMATO_PADRAO,
  VITORIAS_NECESSARIAS,
  READY_CHECK_SEGUNDOS,
  JOGO_TRAVADO_SEGUNDOS,
};
