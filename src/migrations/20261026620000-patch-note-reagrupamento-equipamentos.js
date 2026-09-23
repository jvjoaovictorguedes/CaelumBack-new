"use strict";

// Mudança 100% de frontend (agruparInstancias.ts, caelumfront-new) —
// esta migration só registra a nota de patch pros jogadores. Nenhum
// dado/tabela muda aqui.
module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Equipamentos' AND versao = '2.3' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Equipamentos 2.3 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Equipamentos', '2.3', 'Equipamentos iguais agora ficam agrupados',
         'Cópias idênticas do mesmo equipamento (sem refinamento diferente entre elas) aparecem agrupadas com a quantidade, no Inventário e na Forja, em vez de uma linha separada pra cada cópia. Um equipamento refinado continua sempre com sua própria linha.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Equipamentos", versao: "2.3" });
  },
};
