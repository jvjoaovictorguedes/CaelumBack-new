// Contagem de derrotas por nome de monstro — ver
// migrations/20260930530000-character-monster-kills.js. Usado hoje só
// pelo requisito de caça da árvore de Evolução de Classe
// (classEvolutionService.js), mas fica genérico o bastante pra qualquer
// outro sistema que precise saber "quantos X esse personagem já matou".
const CharacterMonsterKill = require("../models/CharacterMonsterKill");

async function registrarMorte(idPersonagem, nomeMonstro, transaction) {
  const [linha] = await CharacterMonsterKill.findOrCreate({
    where: { id_personagem: idPersonagem, nome_monstro: nomeMonstro },
    defaults: { quantidade: 0 },
    transaction,
  });
  linha.quantidade += 1;
  await linha.save({ transaction });
  return linha.quantidade;
}

async function contarMortes(idPersonagem, nomeMonstro, transaction) {
  if (!nomeMonstro) return 0;
  const linha = await CharacterMonsterKill.findOne({
    where: { id_personagem: idPersonagem, nome_monstro: nomeMonstro },
    transaction,
  });
  return linha?.quantidade ?? 0;
}

module.exports = { registrarMorte, contarMortes };
