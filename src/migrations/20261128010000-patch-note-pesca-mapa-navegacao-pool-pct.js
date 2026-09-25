"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Pesca' AND versao = '1.3' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Pesca 1.3 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Pesca', '1.3', 'Pool de encontro agora mostra % de chance por zona',
         'No Painel Administrativo, a aba "Pool (Zona × Espécie)" agora mostra, ao lado do peso de cada espécie, a chance aproximada (%) dela aparecer naquela zona — calculada a partir da soma dos pesos das espécies ativas da mesma zona, do mesmo jeito que o sorteio real do jogo funciona. O peso continua sendo o valor editável; a % é só uma leitura auxiliar pra facilitar entender a raridade relativa sem precisar fazer conta. Também confirmamos que os pontos de pesca no Mapa Mundial (ícone de peixe nos locais com água) e o editor de Embarcações/Rotas Marítimas no admin já estavam funcionando corretamente.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Pesca", versao: "1.3" });
  },
};
