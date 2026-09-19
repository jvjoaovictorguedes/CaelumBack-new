"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Competitivo' AND versao = '1.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Competitivo 1.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Competitivo', '1.0', 'Chegou a Arena Ranqueada',
         'Novo modo competitivo, separado do Duelo (que continua exatamente como era, casual e sem rating). Na aba "Arena Ranqueada" da página de Duelo, entre na fila e o servidor encontra um oponente com rating parecido pra um duelo ao vivo — quanto mais tempo na fila, mais a faixa de rating aceitável se abre. Cada vitória ou derrota ajusta seu rating por uma fórmula Elo, e sua Liga (Ferro, Bronze, Prata, Ouro, Platina, Diamante ou Mestre) é só um reflexo visual desse rating. A temporada atual mostra seu rating, vitórias/derrotas e melhor rating, e tem um leaderboard sazonal. Se você desconectar no meio de uma partida ranqueada, tem 30 segundos pra voltar antes de perder por abandono. No fim de cada temporada, os ratings sofrem um leve reset em direção ao centro, então a temporada seguinte começa mais equilibrada.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Competitivo", versao: "1.0" });
  },
};
