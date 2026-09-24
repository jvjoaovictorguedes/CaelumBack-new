"use strict";

// Corrige o bug "comprei um equipamento no Mercado Negro e ele não foi
// pro meu inventário": anúncios de item equipável (Arma/Armadura/
// Capacete/Escudo/Acessorio1/Acessorio2) criados ANTES da regra atual
// (marketController.criarAnuncio exige id_instancia pra esse tipo)
// ficaram "Ativo" com id_instancia NULL. Comprar um desses hoje caía no
// branch de "stack" (addStack), criando uma linha de character_inventory
// pra um item que a tela de equipamentos nunca lê (só lê
// CharacterEquipmentInstance) — o comprador pagava e o item "sumia".
//
// Esta migração cancela esses anúncios fantasmas antes que alguém
// consiga comprar um: ninguém perde ouro (nunca foram comprados) e o
// vendedor só precisa reanunciar normalmente, agora passando pela
// validação atual. Idempotente — se não sobrar nenhum, não faz nada.
module.exports = {
  async up(queryInterface) {
    const [anunciosAfetados] = await queryInterface.sequelize.query(`
      SELECT ml.id
      FROM market_listings ml
      JOIN "Items" i ON i.id = ml.id_item
      WHERE ml.status = 'Ativo'
        AND ml.id_instancia IS NULL
        AND i.tipo_item IN ('Arma', 'Armadura', 'Capacete', 'Escudo', 'Acessorio1', 'Acessorio2');
    `);

    if (anunciosAfetados.length === 0) {
      console.log("[migration] Nenhum anúncio fantasma de equipamento encontrado.");
      return;
    }

    const ids = anunciosAfetados.map((a) => a.id);
    console.log(`[migration] Cancelando ${ids.length} anúncio(s) de equipamento sem instância vinculada:`, ids.join(", "));

    await queryInterface.sequelize.query(
      `UPDATE market_listings SET status = 'Cancelado' WHERE id IN (:ids);`,
      { replacements: { ids } },
    );
  },

  async down() {
    // Irreversível de propósito — não há como saber se o anúncio
    // deveria mesmo voltar a "Ativo" (era dado corrompido pra início
    // de conversa).
  },
};
