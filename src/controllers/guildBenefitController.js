// Benefícios/Buffs da Guilda — controller fino, delega tudo pro
// guildBuffService.
const { sequelize } = require("../config/database");
const { listarBeneficios, comprarNivel } = require("../services/guildBuffService");

exports.listar = async (req, res) => {
  try {
    const beneficios = await sequelize.transaction((transaction) => listarBeneficios(req.params.id, transaction));
    res.status(200).json({ status: "success", data: { beneficios } });
  } catch (error) {
    console.error("Erro ao listar benefícios da guilda:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

exports.comprarNivel = async (req, res) => {
  const idPersonagem = req.personagemAtual.id;
  try {
    const resultado = await sequelize.transaction((transaction) =>
      comprarNivel(req.params.id, idPersonagem, req.params.tipo, transaction),
    );
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao comprar benefício da guilda:", error);
    res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor." });
  }
};
