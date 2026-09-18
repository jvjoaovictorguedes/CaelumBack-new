"use strict";

// Completa a linha de equipamento arcano (Capuz/Vestes, ver
// 20260930120000) com o slot que faltava — Botas (Armadura/Pes),
// mesma progressão de raridade e mesmo foco em Inteligência/
// Velocidade, arte reconhecível de bota mágica.
module.exports = {
  async up(queryInterface) {
    const pecas = [
      {
        nome: "Botas de Aprendiz",
        descricao: "Couro simples, mas silencioso o bastante pra não atrapalhar a concentração.",
        tipo_item: "Armadura",
        slot: "Pes",
        raridade: "Comum",
        valor_compra: 16,
        valor_venda: 5,
        peso: 1,
        disponivel_loja: true,
        imagem_url: "/icons/armor/boots/botas-de-aprendiz.png",
        defesa: 1,
        propriedades: { bonus_inteligencia: 1 },
      },
      {
        nome: "Botas Arcanas",
        descricao: "Fivelas reforçadas e um leve zunido a cada passo — já respondem à magia de quem usa.",
        tipo_item: "Armadura",
        slot: "Pes",
        raridade: "Incomum",
        valor_compra: 0,
        valor_venda: 14,
        peso: 1.2,
        disponivel_loja: false,
        imagem_url: "/icons/armor/boots/botas-arcanas.png",
        defesa: 3,
        propriedades: { bonus_inteligencia: 2, bonus_velocidade: 1 },
      },
      {
        nome: "Botas do Adepto",
        descricao: "Runas gravadas na sola — cada passo ajuda a manter o fluxo de energia estável.",
        tipo_item: "Armadura",
        slot: "Pes",
        raridade: "Raro",
        valor_compra: 0,
        valor_venda: 50,
        peso: 1.3,
        disponivel_loja: false,
        imagem_url: "/icons/armor/boots/botas-do-adepto.png",
        defesa: 4,
        propriedades: { bonus_inteligencia: 3, bonus_velocidade: 2 },
      },
      {
        nome: "Botas das Sombras",
        descricao: "Absorvem o som e a luz — quem usa parece deslizar em vez de andar.",
        tipo_item: "Armadura",
        slot: "Pes",
        raridade: "Epico",
        valor_compra: 0,
        valor_venda: 90,
        peso: 1.4,
        disponivel_loja: false,
        imagem_url: "/icons/armor/boots/botas-das-sombras.png",
        defesa: 7,
        propriedades: { bonus_inteligencia: 5, bonus_velocidade: 4 },
      },
      {
        nome: "Botas Celestiais",
        descricao: "Parecem tocar o chão sem pesar nada — a marca de quem já anda entre a magia e o céu.",
        tipo_item: "Armadura",
        slot: "Pes",
        raridade: "Lendario",
        valor_compra: 0,
        valor_venda: 115,
        peso: 1.5,
        disponivel_loja: false,
        imagem_url: "/icons/armor/boots/botas-celestiais.png",
        defesa: 10,
        propriedades: { bonus_inteligencia: 8, bonus_velocidade: 6 },
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
        `INSERT INTO "Items"
           (nome, descricao, tipo_item, raridade, valor_compra, valor_venda, peso, disponivel_loja, imagem_url, "createdAt", "updatedAt")
         VALUES
           (:nome, :descricao, :tipo_item, :raridade, :valor_compra, :valor_venda, :peso, :disponivel_loja, :imagem_url, now(), now())
         RETURNING id;`,
        { replacements: peca },
      );
      const idItem = linhas[0].id;

      const p = peca.propriedades;
      await queryInterface.sequelize.query(
        `INSERT INTO "ArmorProperties"
           (id_item, slot_equipamento, defesa, bonus_forca, bonus_vitalidade, bonus_agilidade, bonus_inteligencia, bonus_velocidade, "createdAt", "updatedAt")
         VALUES
           (:id_item, :slot, :defesa, :forca, :vitalidade, :agilidade, :inteligencia, :velocidade, now(), now());`,
        {
          replacements: {
            id_item: idItem,
            slot: peca.slot,
            defesa: peca.defesa,
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
      nome: ["Botas de Aprendiz", "Botas Arcanas", "Botas do Adepto", "Botas das Sombras", "Botas Celestiais"],
    });
  },
};
