"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Música' AND versao = '1.2' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Música 1.2 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Música', '1.2', 'Controle de volume virou botão flutuante',
         'O controle de música saiu do rodapé da barra lateral (ninguém achava) e virou um botão no canto superior direito, sempre visível — inclusive durante combate na Aventura. Mensagens e Guilda dos Aventureiros ganharam música própria, e o Bestiário não reinicia mais a faixa toda vez que você entra numa região. Também corrigido: um item de consumível corrompido que mostrava "Dano" e bônus de arma na Loja.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Música", versao: "1.2" });
  },
};
