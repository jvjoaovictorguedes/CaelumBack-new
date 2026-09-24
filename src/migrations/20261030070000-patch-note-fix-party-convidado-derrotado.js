"use strict";

// Mudança 100% de frontend (adventure/page.tsx + DerrotadoGate.tsx,
// caelumfront-new) — esta migration só registra a nota de patch.
module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Aventura' AND versao = '4.4' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Aventura 4.4 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Aventura', '4.4', 'Corrigido bug ao aceitar convite de grupo estando derrotado',
         'Um jogador derrotado que aceitava um convite de party vindo de fora da aba de Aventura caía numa tela sem saída. Agora o grupo aparece corretamente mesmo com o personagem derrotado.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Aventura", versao: "4.4" });
  },
};
