"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Forja' AND versao = '3.15' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Forja 3.15 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Forja', '3.15', 'Fabricação carrega muito mais rápido — seções agora abrem sob demanda',
         'A tela de Fabricação da Forja demorava muito pra carregar (e às vezes nem carregava) porque o servidor calculava os ingredientes de TODAS as receitas do catálogo de uma vez, mesmo as de seções que o jogador nem tinha aberto. Agora as seções (Armas, Armaduras, Capacetes, Escudos, Acessórios) começam fechadas mostrando só a contagem de receitas, e os ingredientes de cada uma só são buscados no banco quando o jogador abre aquela seção — bem mais rápido e sem travar.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Forja", versao: "3.15" });
  },
};
