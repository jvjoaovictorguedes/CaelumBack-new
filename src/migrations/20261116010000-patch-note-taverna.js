"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Taverna' AND versao = '1.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Taverna 1.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, resumo, destaque, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Taverna', '1.0', 'A Taverna abriu as portas',
         'Novo hub de descanso, preparação e entretenimento leve. Descanse pagando Gold pra recuperar HP e Mana por completo, compre uma Refeição e uma Bebida no cardápio pra ganhar bônus temporários (uma de cada categoria por vez), ou arrisque seu Gold nos 4 jogos de azar da casa — todos 50/50, com chance e retorno sempre visíveis antes da aposta. Buffs da Taverna nunca valem em Arena Ranqueada, Torneios ou Torneio de Pesca. Acesse pelo menu lateral.',
         'Descanso, cardápio de buffs temporários e jogos de azar 50/50 — tudo pago em Gold, nada de dinheiro real.',
         true, CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Taverna", versao: "1.0" });
  },
};
