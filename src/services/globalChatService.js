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
    idPersonagem: mensagem.id_personagem,
    nome: mensagem.nome_personagem,
    texto: mensagem.texto,
    data: mensagem.createdAt.toISOString(),
  }));
}

async function persistirMensagem({ idPersonagem, nomePersonagem, texto }) {
  await GlobalChatMessage.create({
    id_personagem: idPersonagem,
    nome_personagem: nomePersonagem,
    texto,
  });
}

module.exports = { buscarHistorico, persistirMensagem };
