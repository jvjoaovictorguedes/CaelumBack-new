"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Aprimoramento de Guildas' AND versao = '2.1' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Aprimoramento de Guildas 2.1 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Aprimoramento de Guildas', '2.1', 'Boss da Guilda V2.0: batalha em tempo real',
         'O Boss da Guilda ganhou um jeito novo de lutar: entre numa sala com outros membros online (sem precisar de convite) e enfrentem o chefe em tempo real, por turnos — ele agora revida, começando fraco e batendo cada vez mais forte a cada rodada. Consumíveis não podem ser usados dentro da luta. O ranking de contribuição agora também mostra quantas vezes cada um atacou, e quem causar mais dano na tentativa vencida leva um prêmio extra em ouro, além da recompensa normal que todo mundo já recebia. O jeito antigo (atacar clicando, com cooldown) continua funcionando do mesmo jeito.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Aprimoramento de Guildas", versao: "2.1" });
  },
};
