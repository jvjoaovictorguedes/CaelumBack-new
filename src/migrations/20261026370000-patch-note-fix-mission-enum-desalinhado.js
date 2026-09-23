"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Guilda dos Aventureiros' AND versao = '1.2' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Guilda dos Aventureiros 1.2 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Guilda dos Aventureiros', '1.2', 'Corrigido: model de missões desalinhado do banco',
         'Ajuste interno: o model de Missões só reconhecia parte dos tipos e categorias que o banco já aceitava desde a Guilda dos Aventureiros (Semanal, Mensal, Completar Expedições, Fabricar, Completar Contratos da Guilda). Sem efeito visível pro jogador — necessário antes de qualquer ferramenta administrativa nova de criação de missão.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Guilda dos Aventureiros", versao: "1.2" });
  },
};
