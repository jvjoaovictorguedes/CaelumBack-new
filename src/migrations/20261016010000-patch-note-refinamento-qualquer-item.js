"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Forja' AND versao = '3.7' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Forja 3.7 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Forja', '3.7', 'Refinamento agora funciona em qualquer equipamento',
         'Corrigido um bug sério: o Refinamento só calculava os materiais necessários quando o equipamento tinha sido FABRICADO na Forja. Qualquer coisa comprada na Loja ou dropada de monstro (a maioria dos itens do jogo) não tinha receita nenhuma, e a tela de Refinamento simplesmente não mostrava nada ao selecionar — sem nenhum aviso do motivo. Agora o custo é calculado pela categoria e raridade do item, funciona pra qualquer equipamento, e se algo ainda der errado a tela mostra uma mensagem de erro em vez de ficar muda.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Forja", versao: "3.7" });
  },
};
