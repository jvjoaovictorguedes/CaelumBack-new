// Catálogo de receitas de Alquimia — valida receita/ingredientes e
// formata os dados de listagem/preview (spec §17/§24). Nenhuma função
// aqui debita/credita inventário; isso é papel do alchemyService.js
// dentro da transaction de brew.
require("./../models/associations");
const AlchemyRecipe = require("../models/AlchemyRecipe");
const AlchemyRecipeIngredient = require("../models/AlchemyRecipeIngredient");
const Item = require("../models/Item");
const CharacterInventory = require("../models/CharacterInventory");
const { nivelPorXpTotal } = require("./alchemyProgressionService");
const { possuiDesbloqueio } = require("./alchemyRecipeUnlockService");

async function buscarReceitaAtiva(recipeId, transaction) {
  const recipe = await AlchemyRecipe.findOne({
    where: { id: recipeId, ativo: true },
    include: [{ model: AlchemyRecipeIngredient, as: "ingredientes" }],
    transaction,
  });
  if (!recipe) {
    throw Object.assign(new Error("Receita de Alquimia não encontrada ou desativada."), { statusCode: 404 });
  }
  return recipe;
}

// Confere se a receita está desbloqueada para o personagem (nível ou
// descoberta — spec §9). Não checa quantity/estoque; isso é o motivo de
// bloqueio específico de brew.
async function receitaDesbloqueada(recipe, characterId, nivelAlquimia, transaction) {
  if (recipe.modo_desbloqueio === "NIVEL") {
    return nivelAlquimia >= recipe.nivel_alquimia_minimo;
  }
  // DESCOBERTA — exige unlock explícito, além do nível mínimo (se > 1).
  if (nivelAlquimia < recipe.nivel_alquimia_minimo) return false;
  return possuiDesbloqueio(characterId, recipe.id, transaction);
}

// Lista o catálogo completo com estoque/bloqueio pro personagem (spec
// §16 GET /api/alchemy/recipes, §24 preview). `soAtivas` sempre true
// nesta rota — receita desativada nunca aparece pro jogador.
async function listarCatalogo(characterId, progresso) {
  const nivelAlquimia = nivelPorXpTotal(progresso?.experiencia ?? 0);

  const receitas = await AlchemyRecipe.findAll({
    where: { ativo: true },
    include: [{ model: AlchemyRecipeIngredient, as: "ingredientes" }],
    order: [["ordem", "ASC"], ["id", "ASC"]],
  });

  const idsItens = new Set();
  for (const r of receitas) {
    idsItens.add(r.id_item_resultado);
    for (const ing of r.ingredientes) idsItens.add(ing.id_item);
  }
  const [itens, inventario] = await Promise.all([
    Item.findAll({ where: { id: [...idsItens] } }),
    CharacterInventory.findAll({ where: { id_personagem: characterId } }),
  ]);
  const itemPorId = new Map(itens.map((i) => [i.id, i]));
  const quantidadePorItem = new Map(inventario.map((e) => [e.id_item, e.quantidade]));

  const resultado = [];
  for (const recipe of receitas) {
    const desbloqueada = await receitaDesbloqueada(recipe, characterId, nivelAlquimia, null);
    const itemResultado = itemPorId.get(recipe.id_item_resultado);

    const ingredientesComEstoque = recipe.ingredientes.map((ing) => {
      const item = itemPorId.get(ing.id_item);
      return {
        id_item: ing.id_item,
        nome: item?.nome ?? null,
        imagem_url: item?.imagem_url ?? null,
        raridade: item?.raridade ?? null,
        quantidade_necessaria: ing.quantidade,
        quantidade_possuida: quantidadePorItem.get(ing.id_item) ?? 0,
      };
    });

    const maxCraftable = ingredientesComEstoque.length
      ? Math.min(...ingredientesComEstoque.map((i) => Math.floor(i.quantidade_possuida / i.quantidade_necessaria)))
      : 0;

    let motivoBloqueio = null;
    if (!desbloqueada) {
      motivoBloqueio =
        recipe.modo_desbloqueio === "NIVEL"
          ? `Requer nível ${recipe.nivel_alquimia_minimo} de Alquimia.`
          : "Receita ainda não descoberta.";
    }

    resultado.push({
      id: recipe.id,
      key: recipe.key,
      nome: recipe.nome,
      descricao: recipe.descricao,
      categoria: recipe.categoria,
      nivel_alquimia_minimo: recipe.nivel_alquimia_minimo,
      xp_alquimia: recipe.xp_alquimia,
      custo_ouro: recipe.custo_ouro,
      modo_desbloqueio: recipe.modo_desbloqueio,
      resultado: {
        id_item: recipe.id_item_resultado,
        nome: itemResultado?.nome ?? null,
        imagem_url: itemResultado?.imagem_url ?? null,
        raridade: itemResultado?.raridade ?? null,
        negociavel_mercado: itemResultado?.negociavel_mercado ?? null,
        quantidade: recipe.quantidade_resultado,
      },
      ingredientes: ingredientesComEstoque,
      desbloqueada,
      motivo_bloqueio: motivoBloqueio,
      max_craftable: desbloqueada ? Math.max(0, maxCraftable) : 0,
    });
  }
  return resultado;
}

async function previewReceita(characterId, recipeId, progresso) {
  const todas = await listarCatalogo(characterId, progresso);
  const receita = todas.find((r) => r.id === Number(recipeId));
  if (!receita) {
    throw Object.assign(new Error("Receita de Alquimia não encontrada."), { statusCode: 404 });
  }
  return receita;
}

module.exports = { buscarReceitaAtiva, receitaDesbloqueada, listarCatalogo, previewReceita };
