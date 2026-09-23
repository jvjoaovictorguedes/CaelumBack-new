"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Combate' AND versao = '1.6' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Combate 1.6 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Combate', '1.6', 'Correção: monstro fraco matando personagem em nível baixo',
         'Corrigido um caso em que um monstro de nível bem abaixo do seu ainda conseguia representar perigo real (ex.: nível 4 contra um personagem nível 14) — a redução de força por diferença de nível agora funciona corretamente em qualquer faixa de nível, não só em níveis altos.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Combate", versao: "1.6" });
  },
};
