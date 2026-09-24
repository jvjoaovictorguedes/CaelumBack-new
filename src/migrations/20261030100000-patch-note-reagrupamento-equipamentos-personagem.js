"use strict";

// Mudança 100% de frontend (EquipmentPanel.tsx, caelumfront-new) — esta
// migration só registra a nota de patch.
module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Equipamentos' AND versao = '2.4' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Equipamentos 2.4 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Equipamentos', '2.4', 'Agrupamento de equipamentos iguais chega na tela Meu Personagem',
         'A tela Meu Personagem também estava listando cada cópia de um equipamento numa linha separada. Agora ela usa o mesmo agrupamento por quantidade já usado no Inventário e na Forja.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Equipamentos", versao: "2.4" });
  },
};
