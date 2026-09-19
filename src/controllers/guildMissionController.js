// Missões da Guilda — controller fino, delega tudo pro
// guildMissionService (sem etapa de aceitar/resgatar, §7).
const { sequelize } = require("../config/database");
const { listarQuadro } = require("../services/guildMissionService");

exports.listar = async (req, res) => {
  try {
    const linhas = await sequelize.transaction((transaction) =>
      listarQuadro(req.params.id, req.personagemAtual.id, transaction),
    );
    res.status(200).json({ status: "success", data: { missoes: linhas } });
  } catch (error) {
    console.error("Erro ao listar missões da guilda:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};
