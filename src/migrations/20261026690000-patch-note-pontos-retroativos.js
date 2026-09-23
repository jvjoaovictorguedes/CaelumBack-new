"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Meu Personagem' AND versao = '2.7' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Meu Personagem 2.7 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Meu Personagem', '2.7', 'Pontos de atributo retroativos',
         'Quem já tinha subido de nível recebeu os pontos de atributo que faltavam: +3 por nível já conquistado, pra ficar igual a quem sobe agora com 4 pontos por nível. Confira em Meu Personagem > Status.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Meu Personagem", versao: "2.7" });
  },
};
