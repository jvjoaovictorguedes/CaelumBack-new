"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Aventura' AND versao = '2.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Aventura 2.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Aventura', '2.0', 'Modo Aventura: Áreas de Caça',
         'A Aventura ganhou Áreas de Caça de verdade: Bosque de Sussurros, Terras Devastadas e Covil do Minotauro, cada uma com seus próprios monstros (2 comuns + 1 raro) e espólios exclusivos. Combate agora exige entrar numa área antes de lutar, com contadores de derrotados/raros/XP/ouro/espólios ao vivo durante a caçada. Monstros raros rendem mais recompensa e podem dropar itens exclusivos daquela zona.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Aventura", versao: "2.0" });
  },
};
