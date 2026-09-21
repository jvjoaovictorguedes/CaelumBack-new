"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Equipamentos' AND versao = '2.1' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Equipamentos 2.1 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Equipamentos', '2.1', 'Peças de Mãos removidas do jogo',
         'Removidas as luvas e manoplas (Luvas de Couro, Manoplas de Ferro, Luvas Élficas, Manoplas Sombrias, Manoplas Dracônicas) — uma mão já segura a arma e a outra o escudo, não sobrava uma terceira mão pra uma peça de armadura separada valer a pena. Ninguém tinha uma dessas peças equipada ou anunciada no Mercado no momento da remoção.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Equipamentos", versao: "2.1" });
  },
};
