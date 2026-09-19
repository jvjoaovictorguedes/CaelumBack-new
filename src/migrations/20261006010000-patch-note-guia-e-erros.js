"use strict";

module.exports = {
  async up(queryInterface) {
    const notas = [
      {
        feature: "Guia do Aventureiro",
        versao: "1.0",
        titulo: "Novo Guia do Aventureiro",
        descricao:
          'Chegou uma nova aba no menu, "Guia do Aventureiro", pensada pra quem tá começando (ou quer relembrar o que ainda não experimentou). Ela mostra um checklist com os primeiros passos de Caelum — derrotar um monstro, equipar um item, refinar na Forja, negociar no Mercado, entrar numa Guilda, duelar, mandar uma mensagem e concluir uma missão — cada um com um botão que já leva direto pra tela certa. O progresso é calculado a partir do que você já fez no jogo, então não precisa marcar nada manualmente.',
      },
      {
        feature: "Erros",
        versao: "1.0",
        titulo: "Mensagens de erro mais claras",
        descricao:
          "Revisamos o tratamento de erros em todo o jogo. Uma página que não existe mais (ou um link quebrado) agora mostra um aviso amigável explicando o que aconteceu, em vez da tela de erro genérica do navegador. O mesmo vale pra falhas inesperadas: agora você sempre recebe uma mensagem clara sobre o que deu errado e o que fazer a seguir.",
      },
    ];

    for (const nota of notas) {
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM patch_notes WHERE feature = :feature AND versao = :versao LIMIT 1;`,
        { replacements: { feature: nota.feature, versao: nota.versao } },
      );
      if (existente.length > 0) {
        console.log(`[migration] Nota ${nota.feature} ${nota.versao} já existe — pulando.`);
        continue;
      }

      const [[{ max }]] = await queryInterface.sequelize.query(
        `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
      );

      await queryInterface.sequelize.query(
        `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
         VALUES (:ordem, :feature, :versao, :titulo, :descricao, CURRENT_DATE, now(), now());`,
        {
          replacements: {
            ordem: max + 1,
            feature: nota.feature,
            versao: nota.versao,
            titulo: nota.titulo,
            descricao: nota.descricao,
          },
        },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Guia do Aventureiro", versao: "1.0" });
    await queryInterface.bulkDelete("patch_notes", { feature: "Erros", versao: "1.0" });
  },
};
