"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Vida e Mana' AND versao = '1.1' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Vida e Mana 1.1 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Vida e Mana', '1.1', 'Mana agora regenera com o tempo, igual a vida',
         'Até agora só a vida se recuperava sozinha com o tempo real — a mana só voltava usando poção ou subindo de nível. Agora a mana também regenera passivamente: 12 horas reais pra ir de 0% até 100% da mana máxima, do mesmo jeito que já acontecia com a vida.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Vida e Mana", versao: "1.1" });
  },
};
