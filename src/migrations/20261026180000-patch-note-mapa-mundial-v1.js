"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Mapa' AND versao = '1.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Mapa 1.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Mapa', '1.0', 'Mapa Mundial: Caelum agora tem um mapa de verdade',
         'A tela de Mapa saiu do "Em breve" e virou um mapa ilustrado interativo, com uma Capital neutra no centro dando acesso rápido à Loja, Mercado, Forja, Guildas, Guilda dos Aventureiros e Arena PvP, cercada por 4 territórios (Florestas, Montanhas, Terras Devastadas e Planícies Arcanas). Nele já aparecem as zonas de Aventura e as regiões de Expedição como pontos no mapa — clique em qualquer um pra ver um resumo (perigo, bestiário descoberto, recursos, nível mínimo) e entrar direto de lá. Dá pra filtrar por Aventura, Expedição (com subfiltro por profissão), Cidades ou Serviços, além de dar zoom e arrastar o mapa. Por enquanto os territórios são só visuais — o sistema de controle territorial entre Guildas vem em uma atualização futura.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Mapa", versao: "1.0" });
  },
};
