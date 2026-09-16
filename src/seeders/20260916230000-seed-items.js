"use strict";

// IDs fixados de propósito: id 2 = "Espada de Ferro" e id 3 = "Pocao de
// Vida" pra bater com o que já está hardcoded no front (ShopItem.tsx
// manda id_item: 3 na compra; mock-api.ts usa os mesmos ids no inventário
// mockado). O id 1 é só pra "ocupar" o auto-incremento antes do 2 e 3.
module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      'SELECT COUNT(*)::int AS count FROM "Items";',
    );
    if (rows[0].count > 0) {
      console.log('[seed] "Items" já tem dados — pulando.');
      return;
    }

    await queryInterface.bulkInsert("Items", [
      {
        id: 1,
        nome: "Elmo de Ferro",
        descricao: "Um elmo simples, mas resistente.",
        tipo_item: "Capacete",
        raridade: "Comum",
        valor_compra: 20,
        valor_venda: 8,
        peso: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        nome: "Espada de Ferro",
        descricao: "Uma espada comum, mas confiável.",
        tipo_item: "Arma",
        raridade: "Incomum",
        valor_compra: 40,
        valor_venda: 15,
        peso: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 3,
        nome: "Pocao de Vida",
        descricao: "Regenera 30 pontos de vida durante a aventura.",
        tipo_item: "Consumivel",
        raridade: "Comum",
        valor_compra: 1,
        valor_venda: 0,
        peso: 0.5,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("Items", { id: [1, 2, 3] });
  },
};
