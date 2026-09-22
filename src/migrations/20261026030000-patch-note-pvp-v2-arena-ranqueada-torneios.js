"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'PvP' AND versao = '2.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota PvP 2.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'PvP', '2.0', 'PvP v2: Arena Ranqueada, Torneios e Perfil Competitivo',
         'O PvP virou três experiências separadas. A Patente de Arena antiga saiu de cena, e no lugar dela o Perfil agora mostra seu Elo Ranqueado de verdade. Casual: continua igual, só que agora deixa claro que vitórias e derrotas aqui não valem pro competitivo. Arena Ranqueada: sem fila — clique em "Buscar Partida" e a luta começa na hora contra um adversário real (offline) da sua faixa de Tier, controlado pela IA; ele nunca perde Rating por ter sido escolhido. Suba de Ferro a Mestre em Divisões (IV a I), com 10 partidas por dia e temporadas de 14 dias. Torneios: modo novo com até 8 participantes, chave sorteada aleatoriamente, confrontos MD3 e final MD5 em duelo ao vivo, com disputa de 3º lugar. O Perfil ganhou um rodapé competitivo com seu Elo, vitórias/derrotas da temporada, medalhas de pódio de Torneio e seus Troféus.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "PvP", versao: "2.0" });
  },
};
