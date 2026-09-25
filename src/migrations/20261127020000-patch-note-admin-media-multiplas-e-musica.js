"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Administração' AND versao = '1.4' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Administração 1.4 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Administração', '1.4', 'Biblioteca de Mídia: várias imagens de uma vez e uma seção de Músicas',
         'Na Biblioteca de Mídia do Painel Administrativo, agora dá pra selecionar várias imagens de uma vez no envio — cada uma vira um grupo próprio (com um identificador sugerido a partir do nome do arquivo, editável antes de confirmar) e o envio mostra o status de cada arquivo individualmente. Imagens enviadas também são comprimidas automaticamente ao entrar no sistema, sem perda visível de qualidade. Além disso, a Biblioteca ganhou uma seção de Músicas, pra subir e versionar arquivos de áudio (MP3, OGG, WAV) do mesmo jeito que já funciona pra imagens.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Administração", versao: "1.4" });
  },
};
