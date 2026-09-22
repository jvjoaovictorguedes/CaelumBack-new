"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Aventura' AND versao = '3.9' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Aventura 3.9 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Aventura', '3.9', 'Grupo de aventura não se desfaz mais sozinho',
         'Terminar uma aventura em grupo (vitória ou derrota) não desfaz mais o grupo — todo mundo volta pro lobby pronto pra encarar outra, e só o anfitrião saindo encerra o grupo de vez. Além disso, grupos maiores agora enfrentam um monstro um pouco mais resistente e ofensivo por cabeça extra, já que o risco por jogador diminuía conforme o grupo crescia.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Aventura", versao: "3.9" });
  },
};
