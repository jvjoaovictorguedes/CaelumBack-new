"use strict";

module.exports = {
  async up(queryInterface) {
    const notas = [
      {
        feature: "Combate",
        versao: "1.2",
        titulo: "Portal de Ranque ganha cooldown depois de vencer",
        descricao:
          "Vencer o Portal de Ranque nunca tinha cooldown nenhum — só perder tinha (5 minutos). Isso permitia encadear vitórias sem parar, e cada vitória em Muito Difícil no ranque mais alto paga dezenas de milhares de ouro de uma vez. Agora vencer também aplica um cooldown curto (60s) — dá pra continuar jogando o Portal normalmente, só não em loop instantâneo.",
      },
      {
        feature: "Meu Personagem",
        versao: "2.4",
        titulo: "Evolução de Classe agora também custa ouro",
        descricao:
          "Cada caminho da Evolução de Classe passou a custar 6.000 de ouro, além de nível, relíquia e caçada. Um destino de peso pro ouro logo no momento em que o personagem mais acumulou riqueza — parte de um ajuste maior na economia do jogo pra manter o ouro circulando (ver nota de Combate 1.2 sobre o outro lado desse ajuste).",
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
        { replacements: { ordem: max + 1, ...nota } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Combate", versao: "1.2" });
    await queryInterface.bulkDelete("patch_notes", { feature: "Meu Personagem", versao: "2.4" });
  },
};
