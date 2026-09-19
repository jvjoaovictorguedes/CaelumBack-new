"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Equipamentos' AND versao = '2.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Equipamentos 2.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Equipamentos', '2.0', 'Cada equipamento agora é único de verdade',
         'Reformulamos como o jogo guarda seus equipamentos: arma, capacete, armadura, escudo e acessórios agora existem cada um como uma peça individual, com seu próprio refinamento — nada mais de "pilha" genérica escondendo qual cópia é qual. Isso corrige casos em que o refinamento de uma arma não estava valorizando o dano/defesa dela como devia. Em Meus Equipamentos e no boneco de papel, cada peça mostra seu "+N" de refinamento. No Mercado, anúncios de equipamento agora vendem a cópia exata (com o refinamento dela), não uma quantidade solta. Materiais, consumíveis, moedas e itens de missão continuam empilhados como sempre.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Equipamentos", versao: "2.0" });
  },
};
