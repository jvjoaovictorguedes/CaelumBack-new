// Precisa rodar DEPOIS de authMiddleware (usa req.user.id, já
// verificado pelo JWT). Antes, praticamente todo endpoint que mexe no
// personagem confiava cegamente no id_personagem/characterId que vinha
// no corpo/params/query — qualquer um podia agir como qualquer
// personagem só informando o ID certo. Isso confere que o personagem
// apontado realmente pertence ao usuário autenticado antes de deixar a
// rota seguir, e guarda a instância carregada em `req.personagemDono`
// pra quem quiser reaproveitar (evita um segundo SELECT no controller).
const Character = require("../models/Character");
const User = require("../models/User");

// Igual a exigirDonoDoPersonagem, mas também libera pra admin — usado
// nas rotas de LEITURA que devolvem dados privados do personagem
// (dinheiro, vida, mana, XP, equipamento completo): o dono sempre pode
// ver os próprios dados, e um admin pode ver de qualquer um pra suporte/
// moderação, mas nenhum outro jogador.
function exigirDonoOuAdmin(campo = "id_personagem") {
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
      if (personagem.id_usuario === req.user.id) {
        req.personagemDono = personagem;
        return next();
      }
      const usuario = await User.findByPk(req.user.id, { attributes: ["isAdmin"] });
      if (usuario?.isAdmin) {
        req.personagemDono = personagem;
        return next();
      }
      return res.status(403).json({ message: "Esse personagem não pertence a você." });
    } catch (error) {
      console.error("Erro ao verificar dono do personagem:", error);
      res.status(500).json({ message: "Erro interno do servidor." });
    }
  };
}

// Mesma ideia, mas pro caso de "ver dados de uma CONTA" (não de um
// personagem específico) — usado em /characters/by-user/:userId, onde o
// parâmetro já É o id do usuário, sem precisar carregar personagem
// nenhum pra comparar.
function exigirProprioUsuarioOuAdmin(campo = "userId") {
  return async (req, res, next) => {
    const idUsuarioAlvo = req.params?.[campo];
    if (!idUsuarioAlvo) {
      return res.status(400).json({ message: `${campo} é obrigatório.` });
    }
    if (Number(idUsuarioAlvo) === req.user.id) {
      return next();
    }
    try {
      const usuario = await User.findByPk(req.user.id, { attributes: ["isAdmin"] });
      if (usuario?.isAdmin) {
        return next();
      }
      return res.status(403).json({ message: "Você só pode ver seus próprios dados." });
    } catch (error) {
      console.error("Erro ao verificar privilégio de administrador:", error);
      res.status(500).json({ message: "Erro interno do servidor." });
    }
  };
}

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

module.exports = { exigirDonoDoPersonagem, exigirDonoOuAdmin, exigirProprioUsuarioOuAdmin };
