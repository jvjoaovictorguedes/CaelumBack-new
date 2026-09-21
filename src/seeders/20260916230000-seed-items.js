"use strict";

// DESATIVADO — este seed é de setembro/2026 e ficou obsoleto: os ids
// 1-4 fixos que ele tentava criar ("Elmo de Ferro"/"Espada de
// Ferro"/"Pocao de Vida"/"Pocao de Mana") não têm mais nenhuma relação
// com o catálogo real do jogo hoje (ver scripts/reseed-itens-producao.js,
// que é quem de fato popula "Items" em produção — os ids 1-4 reais são
// "Poção de Vida Pequena/Média/Grande"/"Poção de Mana Pequena"). Além
// de inútil, ele quebrava um setup do zero: `npm run setup:local`
// (migrate && seed) já insere dezenas de itens de catálogo DURANTE as
// migrations (Set Sombrio, Set Dracônico, minérios da Forja...), então
// quando este seed rodava depois, o guard "tabela vazia?" já dava
// falso e ele pulava — só que o PRÓXIMO seed (seed-item-properties.js)
// não sabia disso e tentava usar os ids 3/4 como se existissem,
// estourando "chave estrangeira... não está presente na tabela Items".
// Pra popular o catálogo de itens de verdade num banco novo, rode
// `npm run reseed:itens` (script separado, não idempotente — ver
// aviso no próprio arquivo) depois do migrate.
module.exports = {
  async up() {
    console.log('[seed] seed-items.js está desativado (obsoleto) — use "npm run reseed:itens" pro catálogo real.');
  },

  async down() {
    console.log("[seed] down() é um no-op — este seed não insere mais nada em up().");
  },
};
