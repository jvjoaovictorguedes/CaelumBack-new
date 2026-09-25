// Desbloqueio de receitas DESCOBERTA (spec §9) — grant genérico e
// idempotente. Nenhuma fonte específica (Bestiário/Caçadas/Guild Boss/
// eventos) chama isto ainda nesta entrega (Fase 7 fica pra depois); o
// service só precisa EXISTIR e ser seguro pra integração incremental.
const CharacterAlchemyRecipeUnlock = require("../models/CharacterAlchemyRecipeUnlock");
const AlchemyRecipe = require("../models/AlchemyRecipe");

// grant({ characterId, recipeKey, sourceKey, transaction }) — idempotente
// por (id_personagem, id_recipe): chamar de novo com os mesmos dados não
// duplica nem sobrescreve o source_key original.
async function grant({ characterId, recipeKey, sourceKey = null, transaction } = {}) {
  if (!characterId || !recipeKey) {
    throw Object.assign(new Error("characterId e recipeKey são obrigatórios para desbloquear receita."), {
      statusCode: 400,
    });
  }

  const recipe = await AlchemyRecipe.findOne({ where: { key: recipeKey }, transaction });
  if (!recipe) {
    throw Object.assign(new Error(`Receita de Alquimia desconhecida: ${recipeKey}.`), { statusCode: 404 });
  }

  const [unlock, criado] = await CharacterAlchemyRecipeUnlock.findOrCreate({
    where: { id_personagem: characterId, id_recipe: recipe.id },
    defaults: { source_key: sourceKey, desbloqueada_em: new Date() },
    transaction,
  });

  return { unlock, criado, recipe };
}

async function listarDescobertas(characterId) {
  const unlocks = await CharacterAlchemyRecipeUnlock.findAll({
    where: { id_personagem: characterId },
    include: [{ model: AlchemyRecipe }],
    order: [["desbloqueada_em", "DESC"]],
  });
  return unlocks.map((u) => ({
    id_recipe: u.id_recipe,
    key: u.AlchemyRecipe?.key,
    nome: u.AlchemyRecipe?.nome,
    source_key: u.source_key,
    desbloqueada_em: u.desbloqueada_em,
  }));
}

async function possuiDesbloqueio(characterId, recipeId, transaction) {
  const unlock = await CharacterAlchemyRecipeUnlock.findOne({
    where: { id_personagem: characterId, id_recipe: recipeId },
    transaction,
  });
  return !!unlock;
}

module.exports = { grant, listarDescobertas, possuiDesbloqueio };
