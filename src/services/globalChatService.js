// Histórico de chat global — mesmo padrão de guildChatService.js:
// persistência + limpeza mensal sob demanda (sem cron, limpa na próxima
// vez que alguém entrar na sala, se o mês virou desde a última
// mensagem).
const { Op } = require("sequelize");
const GlobalChatMessage = require("../models/GlobalChatMessage");

const LIMITE_HISTORICO = 200;

function inicioDoMesAtual() {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth(), 1);
}

async function limparMensagensDeMesesAnteriores() {
  await GlobalChatMessage.destroy({
    where: { createdAt: { [Op.lt]: inicioDoMesAtual() } },
  });
}

async function buscarHistorico() {
  await limparMensagensDeMesesAnteriores();

  const mensagens = await GlobalChatMessage.findAll({
    order: [["createdAt", "DESC"]],
    limit: LIMITE_HISTORICO,
  });

  return mensagens.reverse().map((mensagem) => ({
    id: mensagem.id,
    idPersonagem: mensagem.id_personagem,
    nome: mensagem.nome_personagem,
    texto: mensagem.texto,
    data: mensagem.createdAt.toISOString(),
    respondendoA: mensagem.id_mensagem_respondida
      ? {
          id: mensagem.id_mensagem_respondida,
          nome: mensagem.nome_personagem_respondido,
          texto: mensagem.texto_respondido,
        }
      : null,
  }));
}

// `idMensagemRespondida` é opcional (reply, pedido do jogador) — resolve
// e CONGELA nome/texto da mensagem citada aqui mesmo, na escrita, nunca
// um join ao vivo na leitura (mesmo motivo de nome_personagem acima). Um
// id inválido ou de uma mensagem já apagada (limpeza mensal, ou a
// própria mensagem citada citando algo) é silenciosamente ignorado — a
// citação é só um enriquecimento visual, nunca motivo pra bloquear o
// envio de uma mensagem nova.
async function persistirMensagem({ idPersonagem, nomePersonagem, texto, idMensagemRespondida }) {
  let respondendoA = null;
  if (Number.isInteger(idMensagemRespondida)) {
    const original = await GlobalChatMessage.findByPk(idMensagemRespondida, {
      attributes: ["id", "nome_personagem", "texto"],
    });
    if (original) {
      respondendoA = { id: original.id, nome: original.nome_personagem, texto: original.texto };
    }
  }

  const criada = await GlobalChatMessage.create({
    id_personagem: idPersonagem,
    nome_personagem: nomePersonagem,
    texto,
    id_mensagem_respondida: respondendoA?.id ?? null,
    nome_personagem_respondido: respondendoA?.nome ?? null,
    texto_respondido: respondendoA?.texto ?? null,
  });

  return {
    id: criada.id,
    idPersonagem: criada.id_personagem,
    nome: criada.nome_personagem,
    texto: criada.texto,
    data: criada.createdAt.toISOString(),
    respondendoA,
  };
}

module.exports = { buscarHistorico, persistirMensagem };
