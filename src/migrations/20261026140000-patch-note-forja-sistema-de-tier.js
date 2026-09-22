"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Forja' AND versao = '3.11' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Forja 3.11 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Forja', '3.11', 'Tier de Equipamento: o material agora importa de verdade',
         'Todo equipamento ganhou um Tier fixo (de V a I, sendo I o mais forte) que representa a força real daquela receita — Ferro e Cobre são Tier V, Prata e Ouro Tier IV, Cristal de Mana e Obsidiana Tier III, Astralita Tier II e Minério Celestial Tier I. Raridade continua existindo, mas agora mede só a qualidade daquela fabricação específica: uma Espada de Ferro Mítica é uma excelente Espada de Ferro, não mais equivalente a uma Espada de Minério Celestial. Nenhum equipamento foi removido — os valores foram recalculados preservando cada peça, equipamento equipado e anúncio no Mercado. O Tier agora aparece como selo próprio no Inventário, na Forja (antes mesmo de fabricar) e no Mercado, que também ganhou filtro e ordenação por Tier.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Forja", versao: "3.11" });
  },
};
