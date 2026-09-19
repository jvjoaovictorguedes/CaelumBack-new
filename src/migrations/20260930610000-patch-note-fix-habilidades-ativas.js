"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Combate' AND versao = '1.3' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Combate 1.3 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Combate', '1.3', 'Corrige excesso de habilidades ativas em combate',
         'Depois do lote de 36 poderes novos, personagens passaram a entrar em combate com praticamente todos os poderes Ativos aprendidos, não só os 5 marcados na aba Combate — um bug em como novos poderes eram concedidos por nível, que nunca respeitava esse limite. Corrigido: só os 5 marcados aparecem em combate a partir de agora, e quem já tinha mais de 5 marcados foi ajustado automaticamente pros 5 mais antigos (dá pra trocar quais ficam ativos na aba Combate, normalmente).',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Combate", versao: "1.3" });
  },
};
