"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'PvP' AND versao = '2.5' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota PvP 2.5 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'PvP', '2.5', 'Efeitos de status agora valem em duelos PvP',
         'Queimadura, Sangramento, Veneno, Silêncio, Enfraquecer, Congelar, Atordoar, Paralisar e Cegar — configurados em armas e habilidades — agora são aplicados de verdade em duelos ao vivo (Casual, Ranqueada e Torneio), do mesmo jeito que já funcionavam contra monstros na Aventura.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "PvP", versao: "2.5" });
  },
};
