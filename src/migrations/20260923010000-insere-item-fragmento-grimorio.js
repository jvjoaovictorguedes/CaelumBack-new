"use strict";

// O item "Fragmento de Grimório" (ver abilityLevelService.js) só existia
// dentro de reseed-itens-producao.js — que reseta o catálogo INTEIRO e
// apaga o inventário/equipamento de todo mundo (isso já é produção com
// gente jogando, não dá pra rodar aquele script só pra adicionar 1
// item). Esta migration insere só ele, sem mexer em mais nada.
module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM "Items" WHERE nome = 'Fragmento de Grimório' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Item 'Fragmento de Grimório' já existe — pulando.");
      return;
    }

    await queryInterface.bulkInsert("Items", [
      {
        nome: "Fragmento de Grimório",
        descricao:
          "Um pedaço de página arrancada, ainda pulsando com o poder de quem a escreveu. Consumido pra evoluir uma habilidade.",
        tipo_item: "Material",
        raridade: "Raro",
        valor_compra: 0,
        valor_venda: 20,
        peso: 0.05,
        disponivel_loja: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("Items", { nome: "Fragmento de Grimório" });
  },
};
