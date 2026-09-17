const { sequelize } = require("../config/database");
const Character = require("../models/Character");

const {
distribuirPontos,
distribuirPontosAleatoriamente,
} = require("../services/attributeService");

// Distribuição escolhida pelo jogador
const distribuir = async (req, res) => {
try {
// Sempre o personagem do usuário autenticado — o :id da rota é mantido
// só por compatibilidade com o front, mas ignorado aqui.
const id = req.personagemAtual.id;
const { atributo, quantidade } = req.body;

// Trava a linha do personagem: sem isso, duas requisições concorrentes
// pra distribuir pontos liam o mesmo `pontos_distribuir` antes de
// qualquer uma salvar e conseguiam gastar o mesmo ponto duas vezes.
const personagemAtualizado = await sequelize.transaction(async (transaction) => {
  const personagem = await Character.findByPk(id, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!personagem) {
    throw Object.assign(new Error("Personagem não encontrado."), { statusCode: 404 });
  }

  return distribuirPontos(personagem, atributo, quantidade, transaction);
});

return res.status(200).json({
  message: `Pontos distribuídos em ${atributo}.`,
  character: personagemAtualizado,
});

} catch (error) {
const statusCode = error.statusCode || 400;
if (statusCode >= 500) console.error("Erro ao distribuir pontos:", error);

return res.status(statusCode).json({
  message: error.message,
});

}
};

// Distribuição aleatória
const distribuirAleatoriamente = async (req, res) => {
try {
const id = req.personagemAtual.id;

const personagemAtualizado = await sequelize.transaction(async (transaction) => {
  const personagem = await Character.findByPk(id, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!personagem) {
    throw Object.assign(new Error("Personagem não encontrado."), { statusCode: 404 });
  }

  return distribuirPontosAleatoriamente(personagem, transaction);
});

return res.status(200).json({
  message: "Pontos distribuídos aleatoriamente.",
  character: personagemAtualizado,
});

} catch (error) {
const statusCode = error.statusCode || 400;
if (statusCode >= 500) console.error("Erro ao distribuir pontos aleatoriamente:", error);

return res.status(statusCode).json({
  message: error.message,
});

}
};

module.exports = {
distribuir,
distribuirAleatoriamente,
};
