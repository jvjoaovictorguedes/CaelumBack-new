// Precisa rodar depois de authMiddleware + carregarPersonagemAtual.
// Dados internos de guilda (tesouro, logs, convites/candidaturas
// pendentes, permissões por cargo) não são públicos pra jogador de
// fora (seção 13 do documento) — sem isso, qualquer usuário logado
// conseguia ler o extrato/logs de qualquer guilda só sabendo o id.
const GuildMember = require("../models/GuildMember");

function exigirMembroDaGuild(campoGuild = "id") {
  return async (req, res, next) => {
    const idGuild = req.params[campoGuild];
    try {
      const membro = await GuildMember.findOne({
        where: { id_personagem: req.personagemAtual.id },
      });
      if (!membro || membro.id_guild !== Number(idGuild)) {
        return res.status(403).json({ message: "Você não pertence a essa guilda." });
      }
      req.membroGuild = membro;
      next();
    } catch (error) {
      console.error("Erro ao verificar associação à guilda:", error);
      res.status(500).json({ message: "Erro interno do servidor." });
    }
  };
}

module.exports = { exigirMembroDaGuild };
