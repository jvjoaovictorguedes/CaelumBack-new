const Character = require("../models/Character");

const {
distribuirPontos,
distribuirPontosAleatoriamente,
} = require("../services/attributeService");

// Distribuição escolhida pelo jogador
const distribuir = async (req, res) => {
try {
const { id } = req.params;
const { atributo, quantidade } = req.body;


const personagem = await Character.findByPk(id);

if (!personagem) {
  return res.status(404).json({
    message: "Personagem não encontrado.",
  });
}

const personagemAtualizado = await distribuirPontos(
  personagem,
  atributo,
  quantidade
);

return res.status(200).json({
  message: `Pontos distribuídos em ${atributo}.`,
  character: personagemAtualizado,
});

} catch (error) {
console.error("Erro ao distribuir pontos:", error);


return res.status(400).json({
  message: error.message,
});

}
};

// Distribuição aleatória
const distribuirAleatoriamente = async (req, res) => {
try {
const { id } = req.params;


const personagem = await Character.findByPk(id);

if (!personagem) {
  return res.status(404).json({
    message: "Personagem não encontrado.",
  });
}

const personagemAtualizado =
  await distribuirPontosAleatoriamente(personagem);

return res.status(200).json({
  message: "Pontos distribuídos aleatoriamente.",
  character: personagemAtualizado,
});

} catch (error) {
console.error("Erro ao distribuir pontos aleatoriamente:", error);


return res.status(400).json({
  message: error.message,
});


}
};

module.exports = {
distribuir,
distribuirAleatoriamente,
};
