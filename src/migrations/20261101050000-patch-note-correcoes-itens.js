"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Itens' AND versao = '1.2' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Itens 1.2 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Itens', '1.2', 'Correções de itens, poções e loja',
         'Véu da Noite e Véu do Dia agora são armas de verdade (antes contavam como acessório). Poções de vida/mana nunca mais mostram bônus de atributo — só curam. Atributos de arma quebrados (tipo 1.1/1.3) foram corrigidos pra números inteiros. Item marcado como "disponível na loja" agora sempre aparece lá, mesmo raridade Raro. 228 itens que estavam sem foto ganharam um ícone.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Itens", versao: "1.2" });
  },
};
