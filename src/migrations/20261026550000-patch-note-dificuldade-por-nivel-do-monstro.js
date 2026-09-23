"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Combate' AND versao = '1.5' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Combate 1.5 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Combate', '1.5', 'O nível do monstro agora pesa de verdade na dificuldade',
         'Monstros de nível bem abaixo do seu personagem agora são de fato triviais — um monstro de nível baixo não aguenta mais dano nem bate de volta como se estivesse no seu nível. Quanto mais perto o nível do monstro estiver do seu, mais ele continua dando uma luta de verdade, mesmo em níveis altos.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Combate", versao: "1.5" });
  },
};
