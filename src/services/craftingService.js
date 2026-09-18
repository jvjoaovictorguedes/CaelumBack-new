// Forja de Caelum v2 — receita fixa por item (materiais específicos +
// ouro + tempo), no lugar da v1 (funde N itens da mesma categoria em 1
// item ALEATÓRIO da categoria seguinte). A v1 dava exatamente o problema
// que os jogadores reportaram: pedir um cajado e receber uma espada,
// porque o "prêmio" saía sorteado entre todo o catálogo daquela
// categoria+raridade, sem nenhum controle do jogador sobre o resultado.
//
// Agora cada item tem 1 receita (crafting_recipes + crafting_recipe_
// ingredients) e o resultado nunca é aleatório — é sempre o item que o
// jogador escolheu, desde que tenha os materiais, o ouro, e espere o
// tempo de forja (mais longo pra raridades mais altas: Lendario é 12h
// de propósito, forjar não deveria ser mais rápido que caçar sorte).
//
// A forja roda "em segundo plano": iniciar grava iniciado_em/pronto_em
// em character_crafting_queue, e não existe nenhum job/cron rodando —
// "pronto" é só `pronto_em <= now()`, calculado sob demanda sempre que
// o personagem consulta a fila ou tenta coletar (mesmo padrão já usado
// em regen_vida_restante_ms pro combate).
const CraftingRecipe = require("../models/CraftingRecipe");
const CraftingRecipeIngredient = require("../models/CraftingRecipeIngredient");
const Item = require("../models/Item");

// Só 1 forja de cada vez por personagem — sem isso um jogador rico
// poderia empilhar N forjas lendárias em paralelo e só esperar 12h uma
// vez, matando o próprio propósito do tempo de espera.
const APENAS_UMA_FORJA_POR_VEZ = true;

async function listarReceitasComItens(transaction) {
  return CraftingRecipe.findAll({
    include: [
      { model: Item, as: "item" },
      {
        model: CraftingRecipeIngredient,
        as: "ingredientes",
        include: [{ model: Item, as: "material" }],
      },
    ],
    transaction,
  });
}

module.exports = {
  APENAS_UMA_FORJA_POR_VEZ,
  listarReceitasComItens,
};
