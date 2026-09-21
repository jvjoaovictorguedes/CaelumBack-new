"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Forja' AND versao = '3.6' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Forja 3.6 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Forja', '3.6', 'Refinamento agora sempre faz diferença',
         'Corrigido: em itens com atributos baixos, refinar de +0 a +3 (às vezes mais) não mudava NADA no dano/defesa — o bônus percentual era real, mas pequeno demais pra passar do arredondamento. O bônus de atributo de armas (ex.: +1 de Força) podia ficar travado no mesmo valor até o +10. Agora todo refinamento acima de +0 garante pelo menos +1 de verdade em cada atributo positivo do equipamento, então cada nível refinado sempre entrega alguma coisa visível.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Forja", versao: "3.6" });
  },
};
