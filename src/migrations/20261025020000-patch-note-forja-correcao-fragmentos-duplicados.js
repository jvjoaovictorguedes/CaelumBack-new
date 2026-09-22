"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Forja' AND versao = '3.10' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Forja 3.10 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Forja', '3.10', 'Corrigido: fundir mostrando menos fragmentos do que você realmente tem',
         'Em algumas contas, ganhar fragmentos rapidamente (Expedição, Fundição, Fabricação, Refinamento, contratos e missões) podia duplicar a entrada do item no inventário, fazendo a Fundição achar que você tinha bem menos do que a tela mostrava. Agora todo ganho de item é somado de forma atômica na mesma linha — não duplica mais.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Forja", versao: "3.10" });
  },
};
