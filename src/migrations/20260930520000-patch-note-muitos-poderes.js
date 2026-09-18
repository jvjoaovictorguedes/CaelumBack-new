"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Habilidades' AND versao = '2.1' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Habilidades 2.1 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Habilidades', '2.1', '36 poderes novos pra preencher a progressão',
         'Guerreiro, Mago e as 5 raças ganharam 36 poderes novos (26 Ativos + 10 Passivos), espalhados do nível 3 ao 38 — antes a progressão tinha só um punhado de poderes soltos em poucos níveis, deixando muitos níveis sem nada de novo pra desbloquear. Os Passivos novos seguem a mesma regra dos primeiros: precisam ser comprados na aba Habilidades depois de bater o nível.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Habilidades", versao: "2.1" });
  },
};
