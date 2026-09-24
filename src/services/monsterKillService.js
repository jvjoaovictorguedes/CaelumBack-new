// Contagem de derrotas por nome de monstro — ver
// migrations/20260930530000-character-monster-kills.js. Usado pelo
// requisito de caça da árvore de Evolução de Classe
// (classEvolutionService.js) E, desde 20260930700000, pelo Bestiário
// (bestiaryService.js/masteryService.js): "descoberto" é só
// `primeira_derrota_em != null`, sem tabela paralela.
const CharacterMonsterKill = require("../models/CharacterMonsterKill");

async function registrarMorte(idPersonagem, nomeMonstro, transaction) {
  const [linha] = await CharacterMonsterKill.findOrCreate({
    where: { id_personagem: idPersonagem, nome_monstro: nomeMonstro },
    defaults: { quantidade: 0 },
    transaction,
  });
  const descobertoAgora = !linha.primeira_derrota_em;
  linha.quantidade += 1;
  if (descobertoAgora) {
    linha.primeira_derrota_em = new Date();
  }
  await linha.save({ transaction });
  // `descobertoAgora` sinaliza que ESTE abate foi a primeira derrota do
  // monstro — usado pelo combatController pra saber se o Bestiário de
  // uma zona acabou de ser completado pela primeira vez (Bestiário v?
  // "mostrar benefícios da conclusão").
  return { quantidade: linha.quantidade, descobertoAgora };
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
