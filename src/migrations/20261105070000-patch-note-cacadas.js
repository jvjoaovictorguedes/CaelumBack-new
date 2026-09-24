"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Guilda dos Aventureiros' AND versao = '1.4' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Guilda dos Aventureiros 1.4 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Guilda dos Aventureiros', '1.4', 'Novo: Caçadas',
         'A cada 4 horas você recebe uma oferta de Caçada: eliminar uma certa quantidade de um monstro específico da Aventura, que fica temporariamente mais forte (vida e dano aumentados) só pra você, enquanto a Caçada estiver ativa. Cinco níveis de dificuldade (Perigosa até Extermínio) — quanto mais perigosa, menos mortes são exigidas e maior a recompensa em ouro e Reputação de Caçador. Só uma Caçada ativa por vez; abandonar perde todo o progresso. A Reputação de Caçador é permanente, separada do Rank de Aventureiro e da Reputação Comercial do Balcão de Espólios, e libera dificuldades mais perigosas conforme sobe de nível. O perfil do personagem agora mostra um resumo da Guilda dos Aventureiros com as três progressões.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Guilda dos Aventureiros", versao: "1.4" });
  },
};
