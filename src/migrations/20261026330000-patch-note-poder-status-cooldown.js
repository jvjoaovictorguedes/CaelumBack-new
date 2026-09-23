"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Combate' AND versao = '1.4' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Combate 1.4 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Combate', '1.4', 'Status de combate e cooldown real de habilidades',
         'Algumas habilidades agora podem aplicar Queimadura, Sangramento, Veneno, Silêncio, Lentidão ou Enfraquecimento — cada um com ícone próprio mostrando turnos restantes. Habilidades com cooldown configurado ficam realmente indisponíveis por alguns turnos depois de usadas (o botão escurece e mostra quantos turnos faltam), em vez de poderem ser usadas toda hora. Por enquanto vale só na Aventura solo (Party e PvP continuam como estavam).',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Combate", versao: "1.4" });
  },
};
