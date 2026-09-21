"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Forja' AND versao = '3.9' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Forja 3.9 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Forja', '3.9', 'Refinamento sempre sobe de verdade, nível a nível',
         'Corrigido: um equipamento com atributo baixo podia subir no +1 e depois ficar travado no mesmo número por vários refinamentos seguidos, até o percentual configurado ultrapassar 1 ponto sozinho. Agora todo refinamento garante pelo menos +1 a mais que o nível anterior — sempre dá pra ver a diferença ao refinar. Também: clicar em Refinar agora fecha o popup na hora, mostrando o card de "Refinando..." em vez de deixar a tela parada como se nada tivesse acontecido.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Forja", versao: "3.9" });
  },
};
