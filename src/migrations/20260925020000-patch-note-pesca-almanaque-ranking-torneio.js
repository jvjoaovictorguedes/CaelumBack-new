"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Pesca' AND versao = '1.1' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Pesca 1.1 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, resumo, destaque, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Pesca', '1.1', 'Almanaque, Ranking e Torneio da Pesca',
         'Pesca & Navegação ganhou três abas novas: o Almanaque Marinho (todas as espécies, descobertas ou não, com total capturado e maior peso), o Ranking da Pesca (total de peixes capturados e maior peixe já fisgado) e o Torneio da Pesca (evento por tempo limitado, configurável pelo Admin — qualquer captura durante a janela conta automaticamente, sem precisar "entrar"). Pontos de pesca também passaram a aparecer no Mapa de Caelum.',
         'Almanaque, Ranking e Torneio da Pesca, além de pontos de pesca no mapa interativo.',
         true, CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Pesca", versao: "1.1" });
  },
};
