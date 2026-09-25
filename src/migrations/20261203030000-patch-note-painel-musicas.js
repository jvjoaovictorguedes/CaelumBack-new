"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Música' AND versao = '1.3' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Música 1.3 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Música', '1.3', 'Painel Administrativo de Músicas',
         'A trilha sonora do Caelum agora é gerenciada por um painel administrativo dedicado: faixas, páginas, contextos (combate, PvP, bosses) e pools sorteadas (como Mapa e Combate) passam a ser configuráveis sem deploy, com rascunho, publicação e histórico com rollback. Pra quem joga, o comportamento é o mesmo de sempre — a troca é só na origem de onde a configuração vem.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Música", versao: "1.3" });
  },
};
