"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Proezas Únicas' AND versao = '1.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Proezas Únicas 1.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(`SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`);

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Proezas Únicas', '1.0', 'Sistema de Proezas Únicas',
         'Caelum ganha as Proezas Únicas: marcos secretos do mundo que só podem ser conquistados uma vez em toda a história do servidor. O primeiro personagem que cumprir uma condição escondida recebe um Legado — uma habilidade exclusiva que nenhum outro personagem poderá aprender. Confira o Hall das Lendas pra ver quem já escreveu história em Caelum, e fique de olho num anúncio global sempre que uma nova Lenda for escrita.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Proezas Únicas", versao: "1.0" });
  },
};
