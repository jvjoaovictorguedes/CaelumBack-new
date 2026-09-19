// Boss da Guilda — controller fino, delega tudo pro guildBossService
// (mesmo padrão do resto do projeto: controller só valida requisição e
// formata resposta, regra de negócio fica no service).
const { sequelize } = require("../config/database");
const { obterStatus, liberarBoss, atacarBoss } = require("../services/guildBossService");
const { emitParaGuild } = require("../socket/guildSocket");
const GuildLog = require("../models/GuildLog");

async function registrarLog(idGuild, tipo, { responsavel, detalhes, transaction } = {}) {
  await GuildLog.create(
    { id_guild: idGuild, tipo, id_personagem_responsavel: responsavel ?? null, detalhes: detalhes ?? null },
    { transaction },
  );
}

exports.getStatus = async (req, res) => {
  try {
    const dados = await obterStatus(req.params.id);
    res.status(200).json({ status: "success", data: dados });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao buscar boss da guilda:", error);
    res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor." });
  }
};

exports.liberar = async (req, res) => {
  const idPersonagem = req.personagemAtual.id;
  try {
    const tentativa = await sequelize.transaction((transaction) =>
      liberarBoss(req.params.id, idPersonagem, transaction, { registrarLog, emitirEvento: emitParaGuild }),
    );
    res.status(201).json({ status: "success", data: { tentativa } });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao liberar boss da guilda:", error);
    res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor." });
  }
};

exports.atacar = async (req, res) => {
  const idPersonagem = req.personagemAtual.id;
  try {
    const resultado = await sequelize.transaction((transaction) =>
      atacarBoss(req.params.id, idPersonagem, transaction, { registrarLog, emitirEvento: emitParaGuild }),
    );
    res.status(200).json({
      status: "success",
      data: {
        dano_causado: resultado.dano,
        vida_restante: resultado.tentativa.vida_restante,
        vida_total: resultado.tentativa.vida_total,
        derrotado: resultado.derrotado,
        recompensas: resultado.recompensas,
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao atacar boss da guilda:", error);
    res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor." });
  }
};
