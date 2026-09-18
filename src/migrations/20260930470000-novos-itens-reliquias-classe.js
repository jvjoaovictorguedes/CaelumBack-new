"use strict";

// 4 relíquias novas (Mítico/Material, mesmo critério de "Coração de
// Titã"/"Olho do Arcano Eterno" — ver 20260923030000): agora cada classe
// tem 3 caminhos de evolução, e cada caminho pede a SUA própria relíquia.
// Os 2 itens antigos continuam servindo pro primeiro caminho de cada
// classe (Berserker/Arquimago), só os outros 4 caminhos precisavam de
// item novo.
module.exports = {
  async up(queryInterface) {
    const itens = [
      {
        nome: "Escudo de Luz Eterna",
        descricao: "Um fragmento de escudo que nunca se parte — só passa de mão quando o antigo dono para de lutar.",
        raridade: "Mitico",
        valor_venda: 800,
        peso: 3,
      },
      {
        nome: "Brasão do Guardião Real",
        descricao: "Selo forjado pra quem jura proteger igual quanto ataca. Pesa mais do que parece.",
        raridade: "Mitico",
        valor_venda: 800,
        peso: 1,
      },
      {
        nome: "Grimório das Sombras",
        descricao: "Suas páginas nunca ficam no lugar duas vezes seguidas. Quem o lê aprende a drenar mais do que cura.",
        raridade: "Mitico",
        valor_venda: 800,
        peso: 1.5,
      },
      {
        nome: "Pena do Vento Eterno",
        descricao: "Nunca toca o chão. Quem a segura sente a mente correr tão rápido quanto o corpo de outra pessoa.",
        raridade: "Mitico",
        valor_venda: 800,
        peso: 0.1,
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
      nome: ["Escudo de Luz Eterna", "Brasão do Guardião Real", "Grimório das Sombras", "Pena do Vento Eterno"],
    });
  },
};
