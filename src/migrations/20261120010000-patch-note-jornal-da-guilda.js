"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Jornal da Guilda' AND versao = '1.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Jornal da Guilda 1.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, resumo, destaque, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Jornal da Guilda', '1.0', 'O Jornal da Guilda dos Aventureiros estreou',
         'Novo mural de novidades dentro da Guilda dos Aventureiros: acompanhe conquistas notáveis registradas pela administração — o primeiro a alcançar o Rank S, a primeira guilda a bater nível 5, a primeira reputação de Caçador Mestre e outros marcos de Caelum. Acesse pela aba "Jornal da Guilda", dentro da Guilda dos Aventureiros.',
         'Um mural de conquistas notáveis de jogadores e guildas, dentro da Guilda dos Aventureiros.',
         false, CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Jornal da Guilda", versao: "1.0" });
  },
};
