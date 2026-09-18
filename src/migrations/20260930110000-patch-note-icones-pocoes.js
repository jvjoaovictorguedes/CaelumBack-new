"use strict";

// Só a arte mudou (arquivo trocado no mesmo caminho, imagem_url não
// muda) — ajuste pontual pedido pelo usuário, por isso 2.0 -> 2.1 e
// não uma versão nova.
module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Meu Inventário' AND versao = '2.1' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Meu Inventário 2.1 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Meu Inventário', '2.1', 'Ícones novos pras poções',
         'Poção de Vida (Pequena/Média/Grande), Poção de Mana (Pequena/Média/Grande), Tônico Revigorante e Elixir do Aventureiro ganharam arte nova.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Meu Inventário", versao: "2.1" });
  },
};
