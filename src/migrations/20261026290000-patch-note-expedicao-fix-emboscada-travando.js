"use strict";

// Versão 1.1 já tinha sido usada por uma migration antiga (20260930370000
// — "Ícones novos pros fragmentos de minério", batch de várias features
// de uma vez) sem eu conferir antes de escolher o número — a versão real
// mais recente de "Expedição" é 1.6, então esta nota é 1.7.
module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Expedição' AND versao = '1.7' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Expedição 1.7 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Expedição', '1.7', 'Corrigido: emboscada travando o combate',
         'Corrigido um bug em que a tela de emboscada (monstro interrompendo a coleta) travava por completo — não era possível atacar nem sair, só recarregando a página. A tela de combate estava sendo reconstruída do zero a cada segundo por engano, perdendo todo o progresso da luta em andamento.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Expedição", versao: "1.7" });
  },
};
