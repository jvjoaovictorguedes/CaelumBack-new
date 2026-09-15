const ATRIBUTOS_VALIDOS = [
"forca",
"vitalidade",
"agilidade",
"inteligencia",
"velocidade",
];

// Distribuição escolhida pelo jogador
async function distribuirPontos(personagem, atributo, quantidade) {
const pontosDisponiveis = personagem.pontos_distribuir || 0;

if (pontosDisponiveis <= 0) {
throw new Error("O personagem não possui pontos para distribuir.");
}

if (!ATRIBUTOS_VALIDOS.includes(atributo)) {
throw new Error("Atributo inválido.");
}

if (!Number.isInteger(quantidade) || quantidade <= 0) {
throw new Error("A quantidade de pontos deve ser um número inteiro maior que zero.");
}

if (quantidade > pontosDisponiveis) {
throw new Error("O personagem não possui pontos suficientes.");
}

personagem[atributo] += quantidade;
personagem.pontos_distribuir -= quantidade;

await personagem.save();

return personagem;
}

// Distribuição aleatória
async function distribuirPontosAleatoriamente(personagem) {
const pontosDisponiveis = personagem.pontos_distribuir || 0;

if (pontosDisponiveis <= 0) {
throw new Error("O personagem não possui pontos para distribuir.");
}

for (let i = 0; i < pontosDisponiveis; i++) {
const atributoAleatorio =
ATRIBUTOS_VALIDOS[
Math.floor(Math.random() * ATRIBUTOS_VALIDOS.length)
];
personagem[atributoAleatorio] += 1;


}

personagem.pontos_distribuir = 0;

await personagem.save();

return personagem;
}

module.exports = {
distribuirPontos,
distribuirPontosAleatoriamente,
};
