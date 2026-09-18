"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Forja' AND versao = '3.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Forja 3.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Forja', '3.0', 'Forja virou profissão: Fundição, Fabricação e Refinamento',
         'A Forja agora é uma profissão própria (nível 1 a 10, junto com Mineração/Silvicultura/Exploração). Três abas novas: Fundição (funde fragmentos da Expedição em barras, sempre na mesma qualidade), Fabricação (escolha um equipamento e a qualidade dos materiais — o resultado pode sair melhor dependendo da sua sorte e do seu nível de Forja) e Refinamento (+1 até +10 em qualquer equipamento fabricado, com pergaminhos pra aumentar a chance). Chega junto: barras, blueprints e pergaminhos de Refinamento.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Forja", versao: "3.0" });
  },
};
