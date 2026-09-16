"use strict";

// IDs fixados de propósito: id 2 = "Espada de Ferro", id 3 = "Pocao de
// Vida" e id 4 = "Pocao de Mana" pra bater com o que já está hardcoded
// no front (shop/page.tsx usa esses ids nas compras). O id 1 é só pra
// "ocupar" o auto-incremento antes dos outros.
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
        descricao: "Regenera 30% da vida maxima durante a aventura.",
        tipo_item: "Consumivel",
        raridade: "Comum",
        valor_compra: 4,
        valor_venda: 0,
        peso: 0.5,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 4,
        nome: "Pocao de Mana",
        descricao: "Regenera 30% da mana maxima durante a aventura.",
        tipo_item: "Consumivel",
        raridade: "Comum",
        valor_compra: 4,
        valor_venda: 0,
        peso: 0.5,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("Items", { id: [1, 2, 3, 4] });
  },
};
