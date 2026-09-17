// Precisa rodar DEPOIS de authMiddleware (usa req.user.id, já
// verificado pelo JWT). Antes, praticamente todo endpoint que mexe no
// personagem confiava cegamente no id_personagem/characterId que vinha
// no corpo/params/query — qualquer um podia agir como qualquer
// personagem só informando o ID certo. Isso confere que o personagem
// apontado realmente pertence ao usuário autenticado antes de deixar a
// rota seguir, e guarda a instância carregada em `req.personagemDono`
// pra quem quiser reaproveitar (evita um segundo SELECT no controller).
const Character = require("../models/Character");

function exigirDonoDoPersonagem(campo = "id_personagem") {
  return async (req, res, next) => {
    const idPersonagem =
      req.body?.[campo] ?? req.params?.[campo] ?? req.query?.[campo];

    if (!idPersonagem) {
      return res.status(400).json({ message: `${campo} é obrigatório.` });
    }

    try {
      const personagem = await Character.findByPk(idPersonagem);
      if (!personagem) {
        return res.status(404).json({ message: "Personagem não encontrado." });
      }
      if (personagem.id_usuario !== req.user.id) {
        return res.status(403).json({ message: "Esse personagem não pertence a você." });
      }
      req.personagemDono = personagem;
      next();
    } catch (error) {
      console.error("Erro ao verificar dono do personagem:", error);
      res.status(500).json({ message: "Erro interno do servidor." });
    }
  };
}

module.exports = { exigirDonoDoPersonagem };
