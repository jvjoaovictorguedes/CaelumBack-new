"use strict";

// DESATIVADO — dependia dos ids 1-4 que o seed-items.js (irmão deste
// arquivo) tentava criar, e esse seed já está desativado (obsoleto,
// ver comentário lá). Manter este ativo sem o outro é o que gerava
// "chave estrangeira (id_item)=(4) não está presente na tabela Items"
// num setup do zero. O catálogo real (com WeaponProperties/
// ArmorProperties/consumable_properties de verdade) vem das migrations
// + `npm run reseed:itens`.
module.exports = {
  async up() {
    console.log("[seed] seed-item-properties.js está desativado (obsoleto, dependia do seed-items.js).");
  },

  async down() {
    console.log("[seed] down() é um no-op — este seed não insere mais nada em up().");
  },
};
