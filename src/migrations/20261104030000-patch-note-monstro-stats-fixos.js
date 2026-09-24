"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Combate' AND versao = '1.9' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Combate 1.9 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Combate', '1.9', 'Vida e dano do monstro agora são fixos pelo nível dele',
         'Vida e dano dos monstros da Aventura/Expedição paravam de depender só do nível deles e ainda levavam em conta os atributos de quem estava caçando — dois personagens do mesmo nível, com equipamento diferente, enfrentavam o "mesmo" monstro com força bem diferente entre si. Agora vida/dano/agilidade/velocidade do monstro dependem só do nível dele: um monstro de nível 50 é sempre igualmente perigoso, não importa quem entra na luta.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Combate", versao: "1.9" });
  },
};
