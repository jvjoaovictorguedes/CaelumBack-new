"use strict";

// Não existe (e não existia antes) nenhum mecanismo de "só a classe X
// pode equipar" no jogo — Capacete/Armadura sempre foram genéricos,
// diferenciados só por bônus/arte (ex.: Manto Élfico já tem foco em
// Inteligência sem travar a classe). Essa linha segue o mesmo
// princípio: Capuzes e Vestes com foco claro em Inteligência/
// Velocidade (a build de Mago), reconhecíveis pela arte de capuz/robe
// arcano, mas qualquer personagem pode equipar — igual a todo o resto
// do catálogo.
module.exports = {
  async up(queryInterface) {
    const pecas = [
      {
        nome: "Capuz de Aprendiz",
        descricao: "Um capuz simples de couro — o primeiro passo de quem ainda está aprendendo a canalizar magia.",
        tipo_item: "Capacete",
        slot: "Cabeca",
        raridade: "Comum",
        valor_compra: 18,
        valor_venda: 6,
        peso: 1,
        disponivel_loja: true,
        imagem_url: "/icons/helmets/capuz-de-aprendiz.png",
        defesa: 2,
        propriedades: { bonus_inteligencia: 1 },
      },
      {
        nome: "Capuz Arcano",
        descricao: "Fios de runas costurados na trama — já ajuda a manter o foco durante um feitiço.",
        tipo_item: "Capacete",
        slot: "Cabeca",
        raridade: "Incomum",
        valor_compra: 45,
        valor_venda: 15,
        peso: 1,
        disponivel_loja: true,
        imagem_url: "/icons/helmets/capuz-arcano.png",
        defesa: 5,
        propriedades: { bonus_inteligencia: 2 },
      },
      {
        nome: "Capuz do Adepto",
        descricao: "Usado por quem já domina o básico e começa a manipular energia de verdade.",
        tipo_item: "Capacete",
        slot: "Cabeca",
        raridade: "Raro",
        valor_compra: 180,
        valor_venda: 60,
        peso: 1.2,
        disponivel_loja: true,
        imagem_url: "/icons/helmets/capuz-do-adepto.png",
        defesa: 6,
        propriedades: { bonus_inteligencia: 3, bonus_velocidade: 2 },
      },
      {
        nome: "Capuz das Sombras",
        descricao: "Absorve a luz ao redor — quem usa parece sempre estar um passo dentro do escuro.",
        tipo_item: "Capacete",
        slot: "Cabeca",
        raridade: "Epico",
        valor_compra: 0,
        valor_venda: 100,
        peso: 1.4,
        disponivel_loja: false,
        imagem_url: "/icons/helmets/capuz-das-sombras.png",
        defesa: 10,
        propriedades: { bonus_inteligencia: 5, bonus_velocidade: 2 },
      },
      {
        nome: "Capuz Celestial",
        descricao: "Tecido com fios que só existem sob a luz de estrelas específicas — poder puro de conjuração.",
        tipo_item: "Capacete",
        slot: "Cabeca",
        raridade: "Lendario",
        valor_compra: 380,
        valor_venda: 130,
        peso: 1.6,
        disponivel_loja: true,
        imagem_url: "/icons/helmets/capuz-celestial.png",
        defesa: 14,
        propriedades: { bonus_inteligencia: 8, bonus_velocidade: 4 },
      },
      {
        nome: "Vestes de Aprendiz",
        descricao: "Roupas leves de couro — dão liberdade de movimento pra gesticular os primeiros feitiços.",
        tipo_item: "Armadura",
        slot: "Torso",
        raridade: "Comum",
        valor_compra: 30,
        valor_venda: 10,
        peso: 3,
        disponivel_loja: true,
        imagem_url: "/icons/armor/torso/vestes-de-aprendiz.png",
        defesa: 4,
        propriedades: { bonus_inteligencia: 2 },
      },
      {
        nome: "Vestes Arcanas",
        descricao: "Runas bordadas na bainha ajudam a segurar mais energia antes de um feitiço sair do controle.",
        tipo_item: "Armadura",
        slot: "Torso",
        raridade: "Incomum",
        valor_compra: 80,
        valor_venda: 27,
        peso: 5,
        disponivel_loja: true,
        imagem_url: "/icons/armor/torso/vestes-arcanas.png",
        defesa: 10,
        propriedades: { bonus_inteligencia: 4 },
      },
      {
        nome: "Vestes do Adepto",
        descricao: "Reforçadas com placas leves — proteção de verdade sem travar o canalizar de magia.",
        tipo_item: "Armadura",
        slot: "Torso",
        raridade: "Raro",
        valor_compra: 260,
        valor_venda: 88,
        peso: 6,
        disponivel_loja: true,
        imagem_url: "/icons/armor/torso/vestes-do-adepto.png",
        defesa: 11,
        propriedades: { bonus_inteligencia: 6, bonus_velocidade: 2 },
      },
      {
        nome: "Vestes das Sombras",
        descricao: "Tecidas com fios que absorvem a luz — quem usa sente a magia responder mais rápido.",
        tipo_item: "Armadura",
        slot: "Torso",
        raridade: "Epico",
        valor_compra: 0,
        valor_venda: 160,
        peso: 7,
        disponivel_loja: false,
        imagem_url: "/icons/armor/torso/vestes-das-sombras.png",
        defesa: 17,
        propriedades: { bonus_inteligencia: 8, bonus_velocidade: 4 },
      },
      {
        nome: "Vestes Celestiais",
        descricao: "Douradas e brancas como o próprio céu — a marca de quem alcançou o topo da conjuração.",
        tipo_item: "Armadura",
        slot: "Torso",
        raridade: "Lendario",
        valor_compra: 620,
        valor_venda: 210,
        peso: 8,
        disponivel_loja: true,
        imagem_url: "/icons/armor/torso/vestes-celestiais.png",
        defesa: 24,
        propriedades: { bonus_inteligencia: 12, bonus_velocidade: 6 },
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
      nome: [
        "Capuz de Aprendiz", "Capuz Arcano", "Capuz do Adepto", "Capuz das Sombras", "Capuz Celestial",
        "Vestes de Aprendiz", "Vestes Arcanas", "Vestes do Adepto", "Vestes das Sombras", "Vestes Celestiais",
      ],
    });
  },
};
