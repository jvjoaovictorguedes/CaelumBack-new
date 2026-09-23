"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Perfil' AND versao = '1.1' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Perfil 1.1 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Perfil', '1.1', 'Perfil: PvP ranqueado, equipamentos e privacidade',
         'O bloco de PvP do perfil agora mostra só a Arena Ranqueada, com o emblema do seu Elo. Progressão e Conquistas não aparecem mais repetidas, os equipamentos são exibidos no mesmo boneco da aba Equipamentos, e em Meu Personagem > Informações você pode ocultar seus equipamentos para outros jogadores. A aba Status também passou a mostrar o seu Poder.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Perfil", versao: "1.1" });
  },
};
