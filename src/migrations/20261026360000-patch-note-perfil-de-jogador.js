"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Perfil' AND versao = '1.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Perfil 1.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Perfil', '1.0', 'Perfil de Jogador — o Cartão do Aventureiro',
         'Chegou o Perfil de Jogador: clique no nome de qualquer personagem no Ranking pra ver seu Cartão do Aventureiro — nível, raça, classe, natureza mágica, Poder de Combate, Rank de Aventureiro, PvP, Guilda, equipamentos equipados, progressão de Forja e Expedição, resumo do Bestiário e conquistas desbloqueadas. No seu próprio perfil, dá pra escrever uma frase, escolher um título desbloqueado e destacar até 3 conquistas e 3 criaturas favoritas.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Perfil", versao: "1.0" });
  },
};
