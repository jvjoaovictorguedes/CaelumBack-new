"use strict";

// Materiais novos pra alimentar a Forja v2 (ver 20260930070000 e
// 20260930080000) — a v1 fundia "4 itens Épico + ouro" em 1 item
// ALEATÓRIO da categoria, então um jogador que queria um cajado podia
// receber uma espada. A v2 troca isso por receita fixa por item: cada
// equipamento pede materiais específicos de uma "trilha" (Combate,
// Proteção ou Arcano) mais uma "Essência da Forja" universal, os dois
// escalando em raridade junto com o item final.
//
// Cada material já entra automaticamente no pool de drop de combate
// (dropService.TIPOS_DROPAVEIS já inclui "Material" de forma genérica,
// sem lista fixa de nomes) — só os de raridade Comum/Incomum também vão
// pra loja, pra não travar quem está começando.
module.exports = {
  async up(queryInterface) {
    const materiais = [
      // Trilha Combate (Arma, Escudo)
      { nome: "Presa de Lobo", tipo_item: "Material", raridade: "Comum", valor_compra: 8, valor_venda: 3, disponivel_loja: true, descricao: "Presa afiada de um lobo — a base de qualquer forja de combate." },
      { nome: "Minério Bruto", tipo_item: "Material", raridade: "Incomum", valor_compra: 20, valor_venda: 8, disponivel_loja: true, descricao: "Minério ainda impuro, mas já pesado o suficiente pra virar lâmina." },
      { nome: "Aço Rúnico", tipo_item: "Material", raridade: "Raro", valor_compra: 0, valor_venda: 30, disponivel_loja: false, descricao: "Aço gravado com runas de combate — não se acha à venda." },
      { nome: "Cristal de Guerra", tipo_item: "Material", raridade: "Epico", valor_compra: 0, valor_venda: 90, disponivel_loja: false, descricao: "Pulsa com a energia de mil batalhas antigas." },
      { nome: "Núcleo de Dragão", tipo_item: "Material", raridade: "Lendario", valor_compra: 0, valor_venda: 260, disponivel_loja: false, descricao: "O núcleo de poder de um dragão abatido — raríssimo." },

      // Trilha Proteção (Armadura, Capacete)
      { nome: "Couro Cru", tipo_item: "Material", raridade: "Comum", valor_compra: 8, valor_venda: 3, disponivel_loja: true, descricao: "Couro ainda não tratado, mas já resistente o bastante." },
      { nome: "Placa de Ferro", tipo_item: "Material", raridade: "Incomum", valor_compra: 20, valor_venda: 8, disponivel_loja: true, descricao: "Uma chapa de ferro batido, pronta pra virar proteção." },
      { nome: "Fio de Prata Élfico", tipo_item: "Material", raridade: "Raro", valor_compra: 0, valor_venda: 30, disponivel_loja: false, descricao: "Fiado pelos artesãos élficos — leve e quase indestrutível." },
      { nome: "Escama Sombria", tipo_item: "Material", raridade: "Epico", valor_compra: 0, valor_venda: 90, disponivel_loja: false, descricao: "Escama de uma criatura que vive onde a luz não chega." },
      { nome: "Escama de Dragão", tipo_item: "Material", raridade: "Lendario", valor_compra: 0, valor_venda: 260, disponivel_loja: false, descricao: "Praticamente impenetrável — só resta de dragões muito antigos." },

      // Trilha Arcana (Acessorio1/Anel, Acessorio2/Colar)
      { nome: "Pó Brilhante", tipo_item: "Material", raridade: "Comum", valor_compra: 8, valor_venda: 3, disponivel_loja: true, descricao: "Poeira que ainda guarda um resquício de magia." },
      { nome: "Gema Menor", tipo_item: "Material", raridade: "Incomum", valor_compra: 20, valor_venda: 8, disponivel_loja: true, descricao: "Uma gema pequena, mas já capaz de reter encantamento." },
      { nome: "Essência Élfica", tipo_item: "Material", raridade: "Raro", valor_compra: 0, valor_venda: 30, disponivel_loja: false, descricao: "Extraída de um bosque antigo — carrega magia de verdade." },
      { nome: "Fragmento Sombrio", tipo_item: "Material", raridade: "Epico", valor_compra: 0, valor_venda: 90, disponivel_loja: false, descricao: "Um caco de algo que nunca deveria ter sido quebrado." },
      { nome: "Coração de Fogo", tipo_item: "Material", raridade: "Lendario", valor_compra: 0, valor_venda: 260, disponivel_loja: false, descricao: "Ainda pulsa quente, mesmo anos depois de extraído." },

      // Essência da Forja (universal — todo item pede um pouco dela)
      { nome: "Fagulha da Forja", tipo_item: "Material", raridade: "Comum", valor_compra: 8, valor_venda: 3, disponivel_loja: true, descricao: "Uma fagulha só, mas é o que liga qualquer forja." },
      { nome: "Brasa Viva", tipo_item: "Material", raridade: "Incomum", valor_compra: 20, valor_venda: 8, disponivel_loja: true, descricao: "Nunca esfria de verdade, mesmo fora do forno." },
      { nome: "Chama Élfica", tipo_item: "Material", raridade: "Raro", valor_compra: 0, valor_venda: 30, disponivel_loja: false, descricao: "Queima azul — só os élficos sabem acender essa chama." },
      { nome: "Chama Ancestral", tipo_item: "Material", raridade: "Epico", valor_compra: 0, valor_venda: 90, disponivel_loja: false, descricao: "Vem queimando desde antes de qualquer registro." },
      { nome: "Chama Eterna", tipo_item: "Material", raridade: "Lendario", valor_compra: 0, valor_venda: 260, disponivel_loja: false, descricao: "Dizem que nunca se apaga — nenhum forjador viveu o bastante pra confirmar." },
    ];

    for (const material of materiais) {
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM "Items" WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: material.nome } },
      );
      if (existente.length > 0) {
        console.log(`[migration] Material "${material.nome}" já existe — pulando.`);
        continue;
      }

      await queryInterface.sequelize.query(
        `INSERT INTO "Items"
           (nome, descricao, tipo_item, raridade, valor_compra, valor_venda, peso, disponivel_loja, imagem_url, "createdAt", "updatedAt")
         VALUES
           (:nome, :descricao, :tipo_item, :raridade, :valor_compra, :valor_venda, 0.2, :disponivel_loja, '', now(), now());`,
        { replacements: material },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("Items", {
      nome: [
        "Presa de Lobo", "Minério Bruto", "Aço Rúnico", "Cristal de Guerra", "Núcleo de Dragão",
        "Couro Cru", "Placa de Ferro", "Fio de Prata Élfico", "Escama Sombria", "Escama de Dragão",
        "Pó Brilhante", "Gema Menor", "Essência Élfica", "Fragmento Sombrio", "Coração de Fogo",
        "Fagulha da Forja", "Brasa Viva", "Chama Élfica", "Chama Ancestral", "Chama Eterna",
      ],
    });
  },
};
