"use strict";

// Relíquias de Ascensão — item específico que cada classe precisa pra
// evoluir (ver classEvolutionService.js). Mítico (a raridade mais rara
// do jogo), nunca à venda — só cai como drop de PvE, igual qualquer
// Material, mas com a raridade mais baixa possível de sair.
module.exports = {
  async up(queryInterface) {
    const itens = [
      {
        nome: "Coração de Titã",
        descricao:
          "Ainda pulsa, mesmo depois de arrancado do peito da besta. Quem o absorve nunca mais luta como antes.",
        raridade: "Mitico",
        valor_venda: 800,
        peso: 2,
      },
      {
        nome: "Olho do Arcano Eterno",
        descricao:
          "Vê através do tecido da magia. Ninguém sabe dizer se ele observa quem o carrega, ou o contrário.",
        raridade: "Mitico",
        valor_venda: 800,
        peso: 0.3,
      },
    ];

    for (const item of itens) {
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM "Items" WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: item.nome } },
      );
      if (existente.length > 0) {
        console.log(`[migration] Item "${item.nome}" já existe — pulando.`);
        continue;
      }

      await queryInterface.bulkInsert("Items", [
        {
          nome: item.nome,
          descricao: item.descricao,
          tipo_item: "Material",
          raridade: item.raridade,
          valor_compra: 0,
          valor_venda: item.valor_venda,
          peso: item.peso,
          disponivel_loja: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("Items", {
      nome: ["Coração de Titã", "Olho do Arcano Eterno"],
    });
  },
};
