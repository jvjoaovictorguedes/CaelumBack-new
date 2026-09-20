"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Aventura' AND versao = '3.2' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Aventura 3.2 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Aventura', '3.2', 'Mais monstros ganharam sprite e cenário próprios',
         'Aranha Venenosa, Bandido Errante, Cultista Renegado, Golem de Pedra, Orc Guerreiro e Espectro Sussurrante agora têm sprite animado próprio na tela de combate (parado, ataque, dano e derrota), no lugar do ícone genérico de antes. Aranha Venenosa e Cultista Renegado também ganharam cenário de fundo dedicado (um ninho coberto de teias e um altar de rituais).',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Aventura", versao: "3.2" });
  },
};
