// Profissão de Ferreiro §4/§9.1/§11.1 — camada de Receitas sobre o
// Blueprint existente. Nunca decide ingredientes/resultado/Tier (isso
// continua em ForgeBlueprint/ForgeBlueprintIngredient); só decide SE o
// personagem pode fabricar um blueprint "Receita" (precisa nível +
// CharacterForgeRecipeUnlock) e o fluxo de aprender.
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const CharacterForgeProgress = require("../models/CharacterForgeProgress");
const CharacterForgeRecipeUnlock = require("../models/CharacterForgeRecipeUnlock");
const CharacterInventory = require("../models/CharacterInventory");
const ForgeBlueprint = require("../models/ForgeBlueprint");
const ForgeRecipe = require("../models/ForgeRecipe");
const Item = require("../models/Item");
const { nivelPorXpTotal } = require("./forgeProgressionService");
const { removeStack } = require("./inventoryService");
const forgeStatsService = require("./forgeStatsService");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

// Usado por forgeCraftingService.iniciarFabricacao — lança se o
// blueprint exige Receita e o personagem não tem o desbloqueio. Nunca
// chamado fora de uma transaction que já travou o necessário.
async function garantirBlueprintDesbloqueado(characterId, blueprint, transaction) {
  if (blueprint.modo_desbloqueio !== "Receita") return;
  const unlock = await CharacterForgeRecipeUnlock.findOne({
    where: { id_personagem: characterId, id_blueprint: blueprint.id },
    transaction,
  });
  if (!unlock) {
    throw erro(`Você ainda não aprendeu a Receita de "${blueprint.nome}".`, 400);
  }
}

async function idsBlueprintDesbloqueados(characterId) {
  const unlocks = await CharacterForgeRecipeUnlock.findAll({
    where: { id_personagem: characterId },
    attributes: ["id_blueprint"],
  });
  return new Set(unlocks.map((u) => u.id_blueprint));
}

// GET /crafting/recipes (spec §12/§7.2/§7.3) — Livro de Receitas
// (conhecidas, com metadados de coleção) + painel de itens de Receita
// no inventário ainda não aprendidos (prontos ou bloqueados por nível).
async function listarLivroReceitas(characterId) {
  const [progresso, unlocks, receitasComItem, inventario] = await Promise.all([
    CharacterForgeProgress.findOne({ where: { id_personagem: characterId } }),
    CharacterForgeRecipeUnlock.findAll({
      where: { id_personagem: characterId },
      include: [{ model: ForgeBlueprint, as: "blueprint" }],
      order: [["learned_at", "DESC"]],
    }),
    ForgeRecipe.findAll({
      where: { ativo: true },
      include: [
        { model: ForgeBlueprint, as: "blueprint" },
        { model: Item, as: "item" },
      ],
    }),
    CharacterInventory.findAll({ where: { id_personagem: characterId } }),
  ]);
  const nivelForja = nivelPorXpTotal(progresso?.experiencia ?? 0);
  const quantidadePorItem = new Map(inventario.map((e) => [e.id_item, e.quantidade]));
  const idsConhecidos = new Set(unlocks.map((u) => u.id_blueprint));

  const conhecidas = unlocks
    .filter((u) => u.blueprint)
    .map((u) => {
      const receita = receitasComItem.find((r) => r.id_blueprint === u.id_blueprint) ?? null;
      return {
        id_blueprint: u.id_blueprint,
        nome_blueprint: u.blueprint.nome,
        categoria_equipamento: u.blueprint.categoria_equipamento,
        tier_equipamento: u.blueprint.tier_equipamento,
        nivel_forja_necessario: u.blueprint.nivel_forja_minimo,
        raridade_receita: receita?.raridade_receita ?? null,
        origem: u.source_type,
        aprendida_em: u.learned_at,
      };
    });

  const noInventario = receitasComItem
    .filter((r) => !idsConhecidos.has(r.id_blueprint) && (quantidadePorItem.get(r.id_item) ?? 0) > 0)
    .map((r) => ({
      id_item: r.id_item,
      nome_item: r.item.nome,
      imagem_url: r.item.imagem_url,
      raridade_receita: r.raridade_receita,
      id_blueprint: r.id_blueprint,
      nome_blueprint: r.blueprint.nome,
      nivel_forja_necessario: r.blueprint.nivel_forja_minimo,
      pode_aprender: nivelForja >= r.blueprint.nivel_forja_minimo,
      quantidade_disponivel: quantidadePorItem.get(r.id_item) ?? 0,
    }));

  const contagem = { total: conhecidas.length, Comum: 0, Raro: 0, Lendario: 0 };
  for (const c of conhecidas) {
    if (c.raridade_receita && contagem[c.raridade_receita] !== undefined) contagem[c.raridade_receita] += 1;
  }

  return { nivel_forja: nivelForja, resumo: contagem, conhecidas, no_inventario: noInventario };
}

// POST /crafting/recipes/:itemId/learn (spec §11.1) — server-authoritative
// do início ao fim: posse do item, Recipe ativa, duplicata, nível.
async function aprenderReceita(characterId, idItem) {
  return sequelize.transaction(async (transaction) => {
    await Character.findByPk(characterId, { transaction, lock: transaction.LOCK.UPDATE });

    const receita = await ForgeRecipe.findOne({
      where: { id_item: idItem, ativo: true },
      include: [
        { model: ForgeBlueprint, as: "blueprint" },
        { model: Item, as: "item" },
      ],
      transaction,
    });
    if (!receita) throw erro("Esse item não é uma Receita válida.", 404);

    const jaConhece = await CharacterForgeRecipeUnlock.findOne({
      where: { id_personagem: characterId, id_blueprint: receita.id_blueprint },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (jaConhece) {
      throw erro(`Você já conhece a Receita de "${receita.blueprint.nome}" — essa cópia pode ser vendida ou negociada.`, 400);
    }

    const progresso = await CharacterForgeProgress.findOne({
      where: { id_personagem: characterId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const nivelForja = nivelPorXpTotal(progresso?.experiencia ?? 0);
    if (nivelForja < receita.blueprint.nivel_forja_minimo) {
      throw erro(
        `Você precisa de Nível de Ferreiro ${receita.blueprint.nivel_forja_minimo} pra compreender essa Receita (seu nível: ${nivelForja}).`,
        400,
      );
    }

    if (receita.consome_ao_aprender) {
      const entrada = await CharacterInventory.findOne({
        where: { id_personagem: characterId, id_item: idItem },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!entrada || entrada.quantidade < 1) {
        throw erro("Você não possui esse item de Receita.", 400);
      }
      await removeStack(characterId, idItem, 1, transaction);
    }

    const unlock = await CharacterForgeRecipeUnlock.create(
      {
        id_personagem: characterId,
        id_blueprint: receita.id_blueprint,
        source_type: "OTHER",
        learned_at: new Date(),
      },
      { transaction },
    );

    await forgeStatsService.registrarReceitaAprendida(characterId, receita.raridade_receita, transaction);

    return {
      id_blueprint: receita.id_blueprint,
      nome_blueprint: receita.blueprint.nome,
      raridade_receita: receita.raridade_receita,
      aprendida_em: unlock.learned_at,
    };
  });
}

module.exports = {
  garantirBlueprintDesbloqueado,
  idsBlueprintDesbloqueados,
  listarLivroReceitas,
  aprenderReceita,
};
