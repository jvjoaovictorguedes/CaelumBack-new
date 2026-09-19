"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Meu Personagem' AND versao = '2.5' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Meu Personagem 2.5 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Meu Personagem', '2.5', 'Evolução por natureza mágica agora cobre as 8 naturezas',
         'Só Ar e Escuridão tinham árvore de evolução configurada — quem nasceu com Fogo, Água, Terra, Luz, Raio ou Yin&Yang via a aba de Evoluções vazia. Agora as 8 naturezas têm árvore completa (3 estágios cada, níveis 5/15/25), pras 2 classes, com um poder novo concedido no estágio final de cada uma.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Meu Personagem", versao: "2.5" });
  },
};
