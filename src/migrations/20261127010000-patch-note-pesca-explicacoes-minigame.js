"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Pesca' AND versao = '1.2' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Pesca 1.2 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Pesca', '1.2', 'Minigame de Pesca agora explica melhor o que fazer',
         'Depois de lançar a isca, o jogo agora avisa que é preciso continuar clicando em "Fisgar!" até o peixe morder (a janela pra fisgar é curta, então não tem problema clicar antes da hora). Também foram adicionadas explicações sobre o que "Tensão da linha" e os botões Recolher/Soltar significam durante a luta com o peixe.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Pesca", versao: "1.2" });
  },
};
