"use strict";

// Preenche um buraco real no catálogo: a linha de Armadura pulava direto
// de Raro (Élfico) pra Lendário (Dracônico), sem nada Épico no meio —
// o sistema de Forja (craftingService.js) upa raridade EM SEQUÊNCIA, e
// Raro → Épico → Lendário quebraria pra armadura sem esse degrau.
module.exports = {
  async up(queryInterface) {
    const pecas = [
      {
        nome: "Elmo Sombrio",
        descricao: "Some na escuridão até o momento em que já é tarde demais.",
        tipo_item: "Capacete",
        valor_venda: 100,
        peso: 1.5,
        propriedades: { slot_equipamento: "Cabeca", defesa: 10, bonus_agilidade: 3, bonus_inteligencia: 2 },
      },
      {
        nome: "Peitoral Sombrio",
        descricao:
          "Tecido entre as sombras — pesa menos do que parece, corta mais do que aparenta proteger.",
        tipo_item: "Armadura",
        valor_venda: 160,
        peso: 4,
        propriedades: { slot_equipamento: "Torso", defesa: 17, bonus_agilidade: 4, bonus_forca: 3 },
      },
      {
        nome: "Manoplas Sombrias",
        descricao: "Cada golpe some antes do inimigo perceber de onde veio.",
        tipo_item: "Armadura",
        valor_venda: 88,
        peso: 1,
        propriedades: { slot_equipamento: "Maos", defesa: 8, bonus_agilidade: 4 },
      },
      {
        nome: "Botas Sombrias",
        descricao: "Não deixam rastro, nem som, nem chance de fuga pra quem é caçado por elas.",
        tipo_item: "Armadura",
        valor_venda: 95,
        peso: 1,
        propriedades: { slot_equipamento: "Pes", defesa: 8, bonus_velocidade: 5, bonus_agilidade: 3 },
      },
    ];

    for (const peca of pecas) {
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM "Items" WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: peca.nome } },
      );
      if (existente.length > 0) {
        console.log(`[migration] Item "${peca.nome}" já existe — pulando.`);
        continue;
      }

      const [linhas] = await queryInterface.sequelize.query(
        `INSERT INTO "Items" (nome, descricao, tipo_item, raridade, valor_compra, valor_venda, peso, disponivel_loja, "createdAt", "updatedAt")
         VALUES (:nome, :descricao, :tipo_item, 'Epico', 0, :valor_venda, :peso, false, now(), now())
         RETURNING id;`,
        {
          replacements: {
            nome: peca.nome,
            descricao: peca.descricao,
            tipo_item: peca.tipo_item,
            valor_venda: peca.valor_venda,
            peso: peca.peso,
          },
        },
      );
      const idItem = linhas[0].id;

      const p = peca.propriedades;
      await queryInterface.sequelize.query(
        `INSERT INTO "ArmorProperties" (id_item, slot_equipamento, defesa, bonus_forca, bonus_vitalidade, bonus_agilidade, bonus_inteligencia, bonus_velocidade, "createdAt", "updatedAt")
         VALUES (:id_item, :slot, :defesa, :forca, :vitalidade, :agilidade, :inteligencia, :velocidade, now(), now());`,
        {
          replacements: {
            id_item: idItem,
            slot: p.slot_equipamento,
            defesa: p.defesa,
            forca: p.bonus_forca ?? 0,
            vitalidade: p.bonus_vitalidade ?? 0,
            agilidade: p.bonus_agilidade ?? 0,
            inteligencia: p.bonus_inteligencia ?? 0,
            velocidade: p.bonus_velocidade ?? 0,
          },
        },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("Items", {
      nome: ["Elmo Sombrio", "Peitoral Sombrio", "Manoplas Sombrias", "Botas Sombrias"],
    });
  },
};
