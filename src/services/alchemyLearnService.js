// Aprender uma receita física de Alquimia (spec Caldeirão V2 §8.2) —
// transforma a posse de um Item tipo_item="Receita" (pergaminho) em
// conhecimento PERMANENTE da AlchemyRecipe correspondente. Reaproveita
// alchemyRecipeUnlockService.grant como único ponto que já escreve em
// CharacterAlchemyRecipeUnlock (nunca um INSERT paralelo aqui) e
// inventoryService pra consumo — nenhuma regra nova de posse/estoque.
const { sequelize } = require("../config/database");
const AlchemyRecipe = require("../models/AlchemyRecipe");
const CharacterAlchemyProgress = require("../models/CharacterAlchemyProgress");
const CharacterInventory = require("../models/CharacterInventory");
const alchemyRecipeUnlockService = require("./alchemyRecipeUnlockService");
const alchemyProgressionService = require("./alchemyProgressionService");
const inventoryService = require("./inventoryService");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

// POST /api/alchemy/recipes/:id/learn (spec §12/§20) — passo a passo
// exato do §8.2: receita ativa + DESCOBERTA, ainda não conhecida,
// possui o item, nível de Alquimia mínimo; consome 1 unidade só se
// consome_ao_aprender (default true); grant idempotente fecha o fluxo.
async function aprenderReceitaFisica(characterId, recipeId) {
  return sequelize.transaction(async (transaction) => {
    const recipe = await AlchemyRecipe.findOne({
      where: { id: recipeId, ativo: true },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!recipe) throw erro("Receita de Alquimia não encontrada ou desativada.", 404);

    if (recipe.modo_desbloqueio !== "DESCOBERTA") {
      throw erro("Essa receita é liberada por nível de Alquimia, não tem fórmula física para aprender.");
    }
    // Nunca deveria acontecer se o Admin validou ao ativar (spec §19.3),
    // mas o backend revalida tudo de novo — nunca confia só na UI.
    if (!recipe.id_item_receita) {
      throw erro("Essa receita ainda não tem uma fórmula física configurada.", 500);
    }

    const jaConhece = await alchemyRecipeUnlockService.possuiDesbloqueio(characterId, recipe.id, transaction);
    if (jaConhece) {
      throw erro("Você já conhece essa receita.", 409);
    }

    const progresso = await CharacterAlchemyProgress.findOne({
      where: { id_personagem: characterId },
      transaction,
    });
    const nivelAlquimia = alchemyProgressionService.nivelPorXpTotal(progresso?.experiencia ?? 0);
    if (nivelAlquimia < recipe.nivel_alquimia_minimo) {
      throw erro(`Requer nível ${recipe.nivel_alquimia_minimo} de Alquimia para aprender essa fórmula.`);
    }

    const entradaInventario = await CharacterInventory.findOne({
      where: { id_personagem: characterId, id_item: recipe.id_item_receita },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!entradaInventario || entradaInventario.quantidade < 1) {
      throw erro("Você não possui essa fórmula física no inventário.");
    }

    if (recipe.consome_ao_aprender) {
      await inventoryService.removeStack(characterId, recipe.id_item_receita, 1, transaction);
    }

    await alchemyRecipeUnlockService.grant({
      characterId,
      recipeKey: recipe.key,
      sourceKey: "item_receita",
      transaction,
    });

    return {
      aprendida: true,
      id_recipe: recipe.id,
      key: recipe.key,
      nome: recipe.nome,
      consumiu_item: recipe.consome_ao_aprender,
    };
  });
}

module.exports = { aprenderReceitaFisica };
