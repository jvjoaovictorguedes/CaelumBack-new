"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Forja' AND versao = '5.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Forja 5.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Forja', '5.0', 'Painel Administrativo da Forja',
         'A equipe agora consegue criar e balancear blueprints, barras, pergaminhos e as curvas de fundição/fabricação/refinamento da Forja direto pelo Painel Administrativo, sem depender de migration — nada muda na forma de jogar, fabricar, fundir ou refinar.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Forja", versao: "5.0" });
  },
};
