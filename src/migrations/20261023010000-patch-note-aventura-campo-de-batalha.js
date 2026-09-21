"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Aventura' AND versao = '3.4' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Aventura 3.4 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Aventura', '3.4', 'Campo de batalha agora ocupa a tela inteira de verdade',
         'O cenário de combate deixou de ficar dentro de um quadro menor no meio da tela — o fundo agora cobre a tela inteira, como um RPG de turnos moderno. O nome e a vida de cada personagem aparecem flutuando direto acima da cabeça dele, em vez de num card separado embaixo. Corrigido também um bug em que sair de um combate pelo botão "Retornar" não encerrava a área de caça — ao voltar pra Aventura, o jogador caía de novo direto na mesma luta em vez de poder escolher outra área.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Aventura", versao: "3.4" });
  },
};
