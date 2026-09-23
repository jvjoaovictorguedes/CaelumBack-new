// Histórico de chat de guilda — persistência + limpeza mensal (item da
// fila: mantém histórico, mas apaga tudo todo mês). Sem job/cron rodando
// sozinho: igual à regeneração passiva (regenService.js) e ao reset das
// Missões cíclicas (missionService.js), a limpeza acontece sob demanda,
// na próxima vez que alguém abrir o chat daquela guilda — se o mês virou
// desde a última mensagem, some tudo do mês anterior antes de devolver o
// histórico.
const { Op } = require("sequelize");
const GuildChatMessage = require("../models/GuildChatMessage");

const LIMITE_HISTORICO = 200;

function inicioDoMesAtual() {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth(), 1);
}

async function limparMensagensDeMesesAnteriores(idGuild) {
  await GuildChatMessage.destroy({
    where: { id_guild: idGuild, createdAt: { [Op.lt]: inicioDoMesAtual() } },
  });
}

// Sempre limpa primeiro, depois devolve só o que sobrou do mês atual
// (as últimas LIMITE_HISTORICO, em ordem cronológica).
async function buscarHistorico(idGuild) {
  await limparMensagensDeMesesAnteriores(idGuild);

  const mensagens = await GuildChatMessage.findAll({
    where: { id_guild: idGuild },
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

async function persistirMensagem({ idGuild, idPersonagem, nomePersonagem, texto }) {
  await GuildChatMessage.create({
    id_guild: idGuild,
    id_personagem: idPersonagem,
    nome_personagem: nomePersonagem,
    texto,
  });
}

module.exports = { buscarHistorico, persistirMensagem };
