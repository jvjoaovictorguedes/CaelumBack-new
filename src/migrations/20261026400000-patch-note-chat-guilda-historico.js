"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Aprimoramento de Guildas' AND versao = '2.3' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Aprimoramento de Guildas 2.3 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Aprimoramento de Guildas', '2.3', 'Chat da guilda agora guarda histórico',
         'O chat da guilda deixou de ser só tempo real: quem abre a aba de chat agora vê as mensagens de quem já falou antes, não só o que chegar dali pra frente. O histórico é apagado automaticamente todo mês, sempre no início de um mês novo.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Aprimoramento de Guildas", versao: "2.3" });
  },
};
