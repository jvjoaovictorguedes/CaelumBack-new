"use strict";

// Primeiro conteúdo real pros slots Acessorio1/Acessorio2 — existiam no
// backend (VALID_SLOTS, enum, validação) desde sempre, mas nenhum item
// do catálogo tinha esse tipo_item, então os slots nunca apareciam de
// verdade em lugar nenhum. Cintos (Acessorio1, foco força/vitalidade) e
// Medalhões (Acessorio2, foco inteligência/velocidade), 5 raridades
// cada, mesma escala de bônus/preço das outras peças de equipamento
// (ver Peitoral de Couro..Dracônico em ArmorProperties/Torso).
module.exports = {
  async up(queryInterface) {
    const pecas = [
      {
        nome: "Cinto de Couro",
        descricao: "Simples, mas segura bem a cintura de quem ainda está aprendendo a lutar.",
        tipo_item: "Acessorio1",
        raridade: "Comum",
        valor_compra: 30,
        valor_venda: 10,
        peso: 0.8,
        disponivel_loja: true,
        imagem_url: "/icons/belts/cinto-comum.png",
        propriedades: { bonus_forca: 2 },
      },
      {
        nome: "Cinto Reforçado",
        descricao: "Fivelas de metal e couro grosso — aguenta o peso de uma vida de combate.",
        tipo_item: "Acessorio1",
        raridade: "Incomum",
        valor_compra: 80,
        valor_venda: 27,
        peso: 1,
        disponivel_loja: true,
        imagem_url: "/icons/belts/cinto-incomum.png",
        propriedades: { bonus_forca: 3, bonus_vitalidade: 1 },
      },
      {
        nome: "Cinto do Caçador",
        descricao: "Feito pra quem precisa golpear rápido e continuar de pé depois.",
        tipo_item: "Acessorio1",
        raridade: "Raro",
        valor_compra: 260,
        valor_venda: 88,
        peso: 0.9,
        disponivel_loja: true,
        imagem_url: "/icons/belts/cinto-raro.png",
        propriedades: { bonus_forca: 3, bonus_agilidade: 3 },
      },
      {
        nome: "Cinto Sombrio",
        descricao: "Aperta como uma sombra viva — só solta quando o dono manda.",
        tipo_item: "Acessorio1",
        raridade: "Epico",
        valor_compra: 0,
        valor_venda: 160,
        peso: 1.1,
        disponivel_loja: false,
        imagem_url: "/icons/belts/cinto-epico.png",
        propriedades: { bonus_forca: 5, bonus_agilidade: 4 },
      },
      {
        nome: "Cinto Dracônico",
        descricao: "Escamas de dragão costuradas numa faixa só — força bruta em forma de acessório.",
        tipo_item: "Acessorio1",
        raridade: "Lendario",
        valor_compra: 0,
        valor_venda: 210,
        peso: 1.4,
        disponivel_loja: false,
        imagem_url: "/icons/belts/cinto-lendario.png",
        propriedades: { bonus_forca: 8, bonus_vitalidade: 6 },
      },
      {
        nome: "Medalhão de Cobre",
        descricao: "Um pingente simples, mas já responde de leve ao chamado da magia.",
        tipo_item: "Acessorio2",
        raridade: "Comum",
        valor_compra: 30,
        valor_venda: 10,
        peso: 0.3,
        disponivel_loja: true,
        imagem_url: "/icons/amulets/medalhao-comum.png",
        propriedades: { bonus_inteligencia: 2 },
      },
      {
        nome: "Medalhão de Prata",
        descricao: "Prata que guarda um pouco de energia arcana entre um combate e outro.",
        tipo_item: "Acessorio2",
        raridade: "Incomum",
        valor_compra: 80,
        valor_venda: 27,
        peso: 0.3,
        disponivel_loja: true,
        imagem_url: "/icons/amulets/medalhao-incomum.png",
        propriedades: { bonus_inteligencia: 3, bonus_velocidade: 1 },
      },
      {
        nome: "Medalhão Élfico",
        descricao: "Gravado com runas antigas — deixa quem usa mais rápido de raciocínio e de pé.",
        tipo_item: "Acessorio2",
        raridade: "Raro",
        valor_compra: 260,
        valor_venda: 88,
        peso: 0.35,
        disponivel_loja: true,
        imagem_url: "/icons/amulets/medalhao-raro.png",
        propriedades: { bonus_inteligencia: 3, bonus_velocidade: 3 },
      },
      {
        nome: "Medalhão Sombrio",
        descricao: "Pulsa fraco no escuro — quem usa nunca sabe ao certo o que está ouvindo de volta.",
        tipo_item: "Acessorio2",
        raridade: "Epico",
        valor_compra: 0,
        valor_venda: 160,
        peso: 0.4,
        disponivel_loja: false,
        imagem_url: "/icons/amulets/medalhao-epico.png",
        propriedades: { bonus_inteligencia: 5, bonus_velocidade: 4 },
      },
      {
        nome: "Medalhão Dracônico",
        descricao: "Um fragmento de presa de dragão preso numa corrente — poder puro ao alcance do pescoço.",
        tipo_item: "Acessorio2",
        raridade: "Lendario",
        valor_compra: 0,
        valor_venda: 210,
        peso: 0.5,
        disponivel_loja: false,
        imagem_url: "/icons/amulets/medalhao-lendario.png",
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
           (:id_item, :slot, 0, :forca, :vitalidade, :agilidade, :inteligencia, :velocidade, now(), now());`,
        {
          replacements: {
            id_item: idItem,
            slot: peca.tipo_item,
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
      nome: [
        "Cinto de Couro", "Cinto Reforçado", "Cinto do Caçador", "Cinto Sombrio", "Cinto Dracônico",
        "Medalhão de Cobre", "Medalhão de Prata", "Medalhão Élfico", "Medalhão Sombrio", "Medalhão Dracônico",
      ],
    });
  },
};
