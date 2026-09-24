"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Guilda dos Aventureiros' AND versao = '1.3' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Guilda dos Aventureiros 1.3 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Guilda dos Aventureiros', '1.3', 'Novo: Balcão de Espólios',
         'A Guilda dos Aventureiros ganhou o Balcão de Espólios: venda espólios de monstros por um preço fixo (com opção de reservar quantidades e proteger itens contra venda acidental), e receba 5 encomendas pessoais a cada 4 horas — cumprir uma encomenda paga ouro e Reputação Comercial, e completar as 5 de uma vez concede um bônus extra. A Reputação Comercial é permanente, tem 5 níveis e aumenta o multiplicador de prêmio das próximas encomendas.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Guilda dos Aventureiros", versao: "1.3" });
  },
};
