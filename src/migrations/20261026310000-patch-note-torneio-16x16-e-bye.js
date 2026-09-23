"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'PvP' AND versao = '2.3' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota PvP 2.3 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'PvP', '2.3', 'Torneios: novo formato 16x16 e início com vagas sobrando',
         'Torneios agora podem ser criados no formato 16x16, além dos já existentes 4 e 8. E não é mais preciso esperar o número exato de inscritos pra começar: um administrador pode iniciar o torneio mesmo com vagas sobrando — quem fica sem adversário na primeira rodada avança sozinho pra próxima fase (W.O.), sem precisar jogar.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "PvP", versao: "2.3" });
  },
};
