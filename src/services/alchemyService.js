// Orquestra listagem/preview/progresso/brew de Alquimia (spec §14/§15/
// §17/§28). Fino o suficiente pra delegar em
// alchemyRecipeService/alchemyProgressionService/inventoryService — a
// única coisa que mora aqui de fato é o fluxo transacional de brew.
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const CharacterAlchemyProgress = require("../models/CharacterAlchemyProgress");
const CharacterInventory = require("../models/CharacterInventory");
const AlchemyBrewIdempotency = require("../models/AlchemyBrewIdempotency");
const alchemyRecipeService = require("./alchemyRecipeService");
const alchemyProgressionService = require("./alchemyProgressionService");
const inventoryService = require("./inventoryService");
const { QUANTIDADE_MAXIMA_POR_BREW } = require("../config/alchemyConfig");

async function obterOuCriarProgresso(characterId, transaction) {
  const [progresso] = await CharacterAlchemyProgress.findOrCreate({
    where: { id_personagem: characterId },
    defaults: { id_personagem: characterId, nivel: 1, experiencia: 0, total_produzido: 0 },
    transaction,
  });
  return progresso;
}

// GET /api/alchemy/progress
async function obterProgresso(characterId) {
  const progresso = await obterOuCriarProgresso(characterId, null);
  const nivel = alchemyProgressionService.nivelPorXpTotal(progresso.experiencia);
  return {
    nivel,
    experiencia: progresso.experiencia,
    xp_para_proximo_nivel: alchemyProgressionService.xpParaProximoNivel(nivel),
    nivel_maximo: alchemyProgressionService.NIVEL_MAXIMO,
    total_produzido: progresso.total_produzido,
  };
}

// GET /api/alchemy/recipes
async function listarReceitas(characterId) {
  const progresso = await obterOuCriarProgresso(characterId, null);
  return alchemyRecipeService.listarCatalogo(characterId, progresso);
}

// GET /api/alchemy/recipes/:id
async function detalharReceita(characterId, recipeId) {
  const progresso = await obterOuCriarProgresso(characterId, null);
  return alchemyRecipeService.previewReceita(characterId, recipeId, progresso);
}

// POST /api/alchemy/recipes/:id/brew — spec §14 passo a passo. Todo o
// débito/crédito/XP acontece em UMA transaction, com locks explícitos,
// revalidando tudo de novo (nunca confiando no preview do cliente).
async function prepararLote(characterId, recipeId, { quantity, idempotencyKey } = {}) {
  const quantidade = Number(quantity);
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    throw Object.assign(new Error("Quantidade inválida."), { statusCode: 400 });
  }
  if (quantidade > QUANTIDADE_MAXIMA_POR_BREW) {
    throw Object.assign(
      new Error(`Quantidade máxima por preparo é ${QUANTIDADE_MAXIMA_POR_BREW}.`),
      { statusCode: 400 },
    );
  }

  return sequelize.transaction(async (transaction) => {
    // Idempotência: se essa (personagem, key) já foi processada, devolve
    // o resultado gravado sem repetir NENHUM side effect (spec §15/§28).
    if (idempotencyKey) {
      const existente = await AlchemyBrewIdempotency.findOne({
        where: { id_personagem: characterId, idempotency_key: idempotencyKey },
        transaction,
      });
      if (existente) {
        return { ...existente.resultado, idempotent_replay: true };
      }
    }

    // Trava o Character primeiro (mesmo motivo de forgeCraftingService:
    // serializa concorrência antes de qualquer leitura de progresso/
    // inventário que ainda não tenha linha própria).
    const character = await Character.findByPk(characterId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!character) {
      throw Object.assign(new Error("Personagem não encontrado."), { statusCode: 404 });
    }

    const progresso = await CharacterAlchemyProgress.findOne({
      where: { id_personagem: characterId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const progressoAtual = progresso ?? { experiencia: 0, total_produzido: 0 };
    const nivelAlquimia = alchemyProgressionService.nivelPorXpTotal(progressoAtual.experiencia);

    const recipe = await alchemyRecipeService.buscarReceitaAtiva(recipeId, transaction);

    const desbloqueada = await alchemyRecipeService.receitaDesbloqueada(
      recipe,
      characterId,
      nivelAlquimia,
      transaction,
    );
    if (!desbloqueada) {
      throw Object.assign(new Error("Receita ainda não está desbloqueada para este personagem."), {
        statusCode: 400,
      });
    }

    const custoOuroTotal = recipe.custo_ouro * quantidade;
    if (custoOuroTotal > 0 && character.dinheiro < custoOuroTotal) {
      throw Object.assign(new Error("Ouro insuficiente para este preparo."), { statusCode: 400 });
    }

    // Revalida e trava CADA ingrediente dentro da transaction — a
    // checagem de maxCraftable feita na listagem/preview é só UX (spec
    // §14: "A verificação de quantidade fora da transaction serve
    // apenas para UX").
    for (const ingrediente of recipe.ingredientes) {
      const necessario = ingrediente.quantidade * quantidade;
      const entrada = await CharacterInventory.findOne({
        where: { id_personagem: characterId, id_item: ingrediente.id_item },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!entrada || entrada.quantidade < necessario) {
        throw Object.assign(
          new Error(`Ingrediente insuficiente (id_item ${ingrediente.id_item}) para este lote.`),
          { statusCode: 400 },
        );
      }
    }

    // Débito — só depois de confirmar TODOS os ingredientes acima, pra
    // nunca debitar parcialmente antes de descobrir que falta outro.
    for (const ingrediente of recipe.ingredientes) {
      await inventoryService.removeStack(
        characterId,
        ingrediente.id_item,
        ingrediente.quantidade * quantidade,
        transaction,
      );
    }

    if (custoOuroTotal > 0) {
      character.dinheiro -= custoOuroTotal;
      await character.save({ transaction });
    }

    const quantidadeProduzida = recipe.quantidade_resultado * quantidade;
    await inventoryService.addStack(characterId, recipe.id_item_resultado, quantidadeProduzida, transaction);

    const xpGanho = recipe.xp_alquimia * quantidade;
    const ganho = alchemyProgressionService.aplicarGanhoDeXp(progressoAtual.experiencia, xpGanho);

    const [progressoAtualizado] = await CharacterAlchemyProgress.upsert(
      {
        id_personagem: characterId,
        experiencia: ganho.xpTotal,
        total_produzido: (progressoAtual.total_produzido ?? 0) + quantidadeProduzida,
      },
      { transaction, returning: true },
    );

    const resultado = {
      id_recipe: recipe.id,
      key: recipe.key,
      quantidade_lotes: quantidade,
      quantidade_produzida: quantidadeProduzida,
      id_item_resultado: recipe.id_item_resultado,
      custo_ouro_total: custoOuroTotal,
      xp_ganho: ganho.xpGanho,
      nivel_antes: ganho.nivelAntes,
      nivel_depois: ganho.nivelDepois,
      subiu_nivel: ganho.subiuNivel,
      experiencia_total: ganho.xpTotal,
      xp_para_proximo_nivel: ganho.xpParaProximoNivel,
      total_produzido: progressoAtualizado?.total_produzido ?? (progressoAtual.total_produzido ?? 0) + quantidadeProduzida,
    };

    if (idempotencyKey) {
      await AlchemyBrewIdempotency.create(
        {
          id_personagem: characterId,
          idempotency_key: idempotencyKey,
          id_recipe: recipe.id,
          resultado,
        },
        { transaction },
      );
    }

    return { ...resultado, idempotent_replay: false };
  });
}

module.exports = { obterProgresso, listarReceitas, detalharReceita, prepararLote };
