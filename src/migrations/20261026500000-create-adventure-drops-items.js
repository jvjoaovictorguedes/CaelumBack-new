"use strict";

// Criar todos os itens de drop (Material) para os monstros da Aventura.
// Esses itens serão mapeados aos monstros na migration seguinte.
const DROPS = [
  { nome: "Pele Sombria", raridade: "Raro", valor_venda: 250, imagem: "/images/drops/Pele Sombria.png" },
  { nome: "Pele Úmida", raridade: "Incomum", valor_venda: 80, imagem: "/images/drops/Pele Úmida.png" },
  { nome: "Pelo do Alfa", raridade: "Raro", valor_venda: 280, imagem: "/images/drops/Pelo do Alfa.png" },
  { nome: "Pena de Harpia", raridade: "Raro", valor_venda: 300, imagem: "/images/drops/Pena de Harpia.png" },
  { nome: "Placa do Labirinto", raridade: "Épico", valor_venda: 800, imagem: "/images/drops/Placa do Labirinto.png" },
  { nome: "Placa Rúnica", raridade: "Épico", valor_venda: 850, imagem: "/images/drops/Placa Rúnica.png" },
  { nome: "Placa Óssea", raridade: "Incomum", valor_venda: 100, imagem: "/images/drops/Placa Óssea.png" },
  { nome: "Presa Cinzenta", raridade: "Comum", valor_venda: 30, imagem: "/images/drops/Presa Cinzenta.png" },
  { nome: "Presa de Cristal", raridade: "Raro", valor_venda: 320, imagem: "/images/drops/Presa de Cristal.png" },
  { nome: "Presa de Hidra", raridade: "Épico", valor_venda: 900, imagem: "/images/drops/Presa de Hidra.png" },
  { nome: "Presa de Javali", raridade: "Incomum", valor_venda: 110, imagem: "/images/drops/Presa de Javali.png" },
  { nome: "Presa de Lobo Sombrio", raridade: "Raro", valor_venda: 290, imagem: "/images/drops/Presa de Lobo Sombrio.png" },
  { nome: "Presa de Serpente", raridade: "Incomum", valor_venda: 95, imagem: "/images/drops/Presa de Serpente.png" },
  { nome: "Presa do Alfa", raridade: "Raro", valor_venda: 310, imagem: "/images/drops/Presa do Alfa.png" },
  { nome: "Presa do Cão de Guerra", raridade: "Raro", valor_venda: 270, imagem: "/images/drops/Presa do Cão de Guerra.png" },
  { nome: "Selo do Capitão", raridade: "Épico", valor_venda: 750, imagem: "/images/drops/Selo do Capitão.png" },
  { nome: "Véu Mortuário", raridade: "Raro", valor_venda: 260, imagem: "/images/drops/Véu Mortuário.png" },
  { nome: "Garra do Abismo", raridade: "Épico", valor_venda: 950, imagem: "/images/drops/Garra do Abismo.png" },
  { nome: "Glândula Regenerativa", raridade: "Raro", valor_venda: 340, imagem: "/images/drops/Glândula Regenerativa.png" },
  { nome: "Glândula Tóxica", raridade: "Raro", valor_venda: 330, imagem: "/images/drops/Glândula Tóxica.png" },
  { nome: "Glândula Ígnea", raridade: "Raro", valor_venda: 350, imagem: "/images/drops/Glândula Ígnea.png" },
  { nome: "Gosma Arcana", raridade: "Raro", valor_venda: 400, imagem: "/images/drops/Gosma Arcana.png" },
  { nome: "Insígnia Mercenária", raridade: "Épico", valor_venda: 820, imagem: "/images/drops/Insígnia Mercenária.png" },
  { nome: "Núcleo de Lodo", raridade: "Incomum", valor_venda: 120, imagem: "/images/drops/Núcleo de Lodo.png" },
  { nome: "Núcleo Incandescente", raridade: "Raro", valor_venda: 420, imagem: "/images/drops/Núcleo Incandescente.png" },
  { nome: "Núcleo Rúnico Ancestral", raridade: "Lendário", valor_venda: 2500, imagem: "/images/drops/Núcleo Rúnico Ancestral.png" },
  { nome: "Olho de Mana", raridade: "Raro", valor_venda: 380, imagem: "/images/drops/Olho de Mana.png" },
  { nome: "Olho Petrificante", raridade: "Épico", valor_venda: 1000, imagem: "/images/drops/Olho Petrificante.png" },
  { nome: "Orelha de Goblin", raridade: "Incomum", valor_venda: 90, imagem: "/images/drops/Orelha de Goblin.png" },
  { nome: "Osso Antigo", raridade: "Incomum", valor_venda: 75, imagem: "/images/drops/Osso Antigo.png" },
  { nome: "Pele de Obsidiana", raridade: "Épico", valor_venda: 880, imagem: "/images/drops/Pele de Obsidiana.png" },
  { nome: "Pele de Troll", raridade: "Raro", valor_venda: 360, imagem: "/images/drops/Pele de Troll.png" },
  { nome: "Pele Queimada", raridade: "Raro", valor_venda: 370, imagem: "/images/drops/Pele Queimada.png" },
];

module.exports = {
  async up(queryInterface) {
    for (const drop of DROPS) {
      const [[existente]] = await queryInterface.sequelize.query(
        `SELECT id FROM "Items" WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: drop.nome } },
      );

      if (existente) {
        console.log(`[migration] Item "${drop.nome}" já existe — pulando.`);
        continue;
      }

      await queryInterface.sequelize.query(
        `INSERT INTO "Items" (nome, descricao, tipo_item, raridade, valor_compra, valor_venda, peso, imagem_url, disponivel_loja, "createdAt", "updatedAt")
         VALUES (:nome, :descricao, 'Material', :raridade, 0, :valor_venda, 0.5, :imagem_url, false, now(), now());`,
        {
          replacements: {
            nome: drop.nome,
            descricao: `Material de drop de monstros. ${drop.nome} é um componente raro e valioso.`,
            raridade: drop.raridade,
            valor_venda: drop.valor_venda,
            imagem_url: drop.imagem,
          },
        },
      );

      console.log(`[migration] Item "${drop.nome}" criado com sucesso.`);
    }
  },

  async down(queryInterface) {
    for (const drop of DROPS) {
      await queryInterface.sequelize.query(
        `DELETE FROM "Items" WHERE nome = :nome;`,
        { replacements: { nome: drop.nome } },
      );
    }
  },
};
