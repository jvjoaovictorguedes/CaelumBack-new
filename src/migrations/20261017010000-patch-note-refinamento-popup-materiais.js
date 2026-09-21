"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Forja' AND versao = '3.8' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Forja 3.8 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Forja', '3.8', 'Refinamento agora abre num popup e mostra os materiais',
         'Clicar num equipamento na aba Refinamento abre um popup na hora, em vez de mostrar a prévia lá embaixo da tela (fácil de não perceber que apareceu algo). E agora o popup mostra de verdade quais materiais são necessários — antes só aparecia o custo em ouro, sem dizer o que juntar.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Forja", versao: "3.8" });
  },
};
