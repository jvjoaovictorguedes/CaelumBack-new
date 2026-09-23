"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'PvP' AND versao = '2.2' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota PvP 2.2 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'PvP', '2.2', 'Corrigido: torneio travado bloqueando a Ranqueada',
         'Corrigido um bug em que uma série de torneio que não conseguia iniciar o duelo automaticamente (por exemplo, um dos jogadores momentaneamente offline no instante exato) ficava presa "Em Andamento" para sempre, mesmo sem nenhuma partida de fato acontecendo — e continuava bloqueando o acesso à Arena Ranqueada com a mensagem de série em andamento. Agora uma varredura periódica detecta séries travadas nesse estado e as resolve automaticamente (W.O. para quem estiver online, ou pendência administrativa se ninguém estiver).',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "PvP", versao: "2.2" });
  },
};
