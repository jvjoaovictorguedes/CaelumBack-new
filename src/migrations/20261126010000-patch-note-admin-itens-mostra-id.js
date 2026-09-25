"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Administração' AND versao = '1.3' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Administração 1.3 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Administração', '1.3', 'Painel Admin agora mostra o ID de cada item',
         'Na aba Itens do Painel Administrativo, cada item agora exibe seu ID (somente leitura, nunca editável) na lista e na tela de edição. Todo lugar do admin onde você escolhe um item — Conjuntos de Equipamento, Premiações, World Boss, Pesca, Aventura e Missões — agora tem um menu com o nome do item já mostrando "(ID: N)", então não é mais preciso ir até a tela de Itens pra descobrir o número antes de digitar.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Administração", versao: "1.3" });
  },
};
