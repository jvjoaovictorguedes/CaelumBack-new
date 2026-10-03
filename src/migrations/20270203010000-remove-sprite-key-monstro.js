"use strict";

// Pedido do jogador: nenhum monstro deve mais depender de sprite animado
// fixo embutido no front (COMPONENTE_POR_SPRITE_KEY em
// caelumfront-new/.../sprites/spriteForEnemy.tsx) — os 9 monstros legados
// (migration 20261026450000-aventura-expansao-sprite-key-legado.js) agora
// usam imagem_url escolhida pelo Admin, igual aos outros 31 monstros do
// catálogo e igual a Guild Boss/World Boss (nenhum dos dois nunca teve
// sprite_key). Nada lê mais essa coluna no backend (model/admin/
// combatController/partySocket/expeditionService/bestiaryService já
// removidos) nem no front (resolver + os 9 componentes *Sprite.tsx
// removidos), então a coluna fica órfã — idempotente via describeTable,
// mesmo padrão de 20260919010000-add-power-imagem-url.js.
module.exports = {
  async up(queryInterface) {
    const descricao = await queryInterface.describeTable("AdventureMonsters");
    if (!("sprite_key" in descricao)) {
      console.log('[migration] "AdventureMonsters"."sprite_key" já não existe — pulando.');
      return;
    }
    await queryInterface.removeColumn("AdventureMonsters", "sprite_key");
  },

  async down(queryInterface, Sequelize) {
    const descricao = await queryInterface.describeTable("AdventureMonsters");
    if ("sprite_key" in descricao) return;
    await queryInterface.addColumn("AdventureMonsters", "sprite_key", {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
  },
};
