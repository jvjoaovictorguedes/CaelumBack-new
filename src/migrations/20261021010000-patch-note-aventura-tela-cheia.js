"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Aventura' AND versao = '3.3' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Aventura 3.3 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Aventura', '3.3', 'Combate da Aventura agora é em tela cheia',
         'Ao entrar em combate na Aventura, a tela do jogo agora ocupa a tela inteira, sem o menu do dashboard — assim como uma batalha de RPG de verdade. Enquanto o combate estiver em andamento, a única forma de sair é pelo botão "Retornar", que mostra um aviso: o dano que você já tomou na luta é mantido, e você não recebe a experiência nem as moedas da batalha se sair antes dela terminar.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Aventura", versao: "3.3" });
  },
};
