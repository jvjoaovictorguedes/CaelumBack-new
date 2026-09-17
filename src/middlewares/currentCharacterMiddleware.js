// Precisa rodar DEPOIS de authMiddleware. Cada conta tem no máximo um
// personagem (é assim que login/character-session já tratam o jogo), então
// pra qualquer ação de "faça isso com o MEU personagem" o dono de verdade é
// sempre req.user.id — nunca o id_personagem/characterId que o corpo da
// requisição mandar. Isso substitui, de uma vez só, o padrão antigo (cada
// controller confiava cegamente nesse campo) que deixava qualquer um agir
// como qualquer personagem só acertando o ID.
//
// Os controllers continuam recebendo o id do personagem exatamente como
// antes — só que agora vem de req.personagemAtual.id em vez do corpo/query/
// params, então nenhum contrato de API muda pro frontend.
const Character = require("../models/Character");

async function carregarPersonagemAtual(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({ message: "Não autenticado." });
  }
  try {
    const personagem = await Character.findOne({ where: { id_usuario: req.user.id } });
    if (!personagem) {
      return res.status(404).json({ message: "Você ainda não tem um personagem." });
    }
    req.personagemAtual = personagem;
    next();
  } catch (error) {
    console.error("Erro ao carregar personagem atual:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
}

module.exports = { carregarPersonagemAtual };
