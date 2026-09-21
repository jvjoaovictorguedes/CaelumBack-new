"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Forja' AND versao = '3.5' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Forja 3.5 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Forja', '3.5', 'Minério mais raro agora faz diferença de verdade',
         'Corrigido: Espada, Cajado, Peitoral e Anel fabricados escalavam só pela qualidade do material, nunca pelo minério em si — um item de Cobre e um de Minério Celestial saíam com o mesmo dano/defesa/valor de venda na mesma qualidade, mesmo o Minério Celestial sendo muito mais raro de encontrar. Agora cada minério tem seu próprio multiplicador (na mesma ordem de raridade das regiões de Mineração), então vale a pena garimpar até a última região.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Forja", versao: "3.5" });
  },
};
