"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Guilda dos Aventureiros' AND versao = '1.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Guilda dos Aventureiros 1.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Guilda dos Aventureiros', '1.0', 'Missões virou Guilda dos Aventureiros',
         'A aba de Missões agora é a Guilda dos Aventureiros: além das missões Diárias, ganhou Semanais e Mensais, e um novo Rank de Aventureiro (F a S) com contratos que se renovam a cada 6 horas. Complete contratos do seu Rank pra ficar apto a uma Provação — uma missão especial que te promove pro próximo Rank. Contratos podem pedir desde caçadas simples até entrega de materiais raros, e ficam cada vez mais exigentes em Ranks mais altos.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Guilda dos Aventureiros", versao: "1.0" });
  },
};
