"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Aprimoramento de Guildas' AND versao = '2.2' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Aprimoramento de Guildas 2.2 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Aprimoramento de Guildas', '2.2', 'Boss da Guilda: só um jeito de atacar agora',
         'O clique avulso de "Atacar o Boss" saiu — a batalha em tempo real virou o único (e agora oficial) "Atacar o Boss". Depois de lutar, espere 20 minutos pra atacar de novo (era 4 horas no clique antigo). O dano crescente do chefe por rodada também ficou um pouco mais forte.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Aprimoramento de Guildas", versao: "2.2" });
  },
};
