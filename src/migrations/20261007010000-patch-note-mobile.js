"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Mobile' AND versao = '1.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Mobile 1.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Mobile', '1.0', 'Correções de tela para celular',
         'Revisamos o jogo inteiro no celular e corrigimos telas que estavam quebrando. O destaque foi a aba Combate em Meu Personagem, onde os botões de "Selecionar"/"Remover" das habilidades e consumíveis se sobrepunham e ficavam ilegíveis em telas pequenas. Também corrigimos o Ranking e o leaderboard da Arena Ranqueada, onde nomes de jogador longos empurravam o nível/rating pra fora da tela; os filtros do Mercado, que ficavam cortados; e listas de guilda (contribuições, extrato do tesouro, registros) com o mesmo problema. O aviso de "Ativar Som" agora é mais discreto no celular e pode ser fechado.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Mobile", versao: "1.0" });
  },
};
