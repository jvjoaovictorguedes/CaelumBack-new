"use strict";

// Guerreiro aprende Golpe Poderoso, Mago aprende Cura Arcana e Bola de
// Fogo (sem essa segunda, o mago não tinha poder ofensivo nenhum).
module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      "SELECT COUNT(*)::int AS count FROM class_abilities;",
    );
    if (rows[0].count > 0) {
      console.log('[seed] "class_abilities" já tem dados — pulando.');
      return;
    }

    await queryInterface.bulkInsert("class_abilities", [
      { id_classe: 1, id_poder: 1, nivel_aprendizagem: 1 },
      { id_classe: 2, id_poder: 2, nivel_aprendizagem: 1 },
      { id_classe: 2, id_poder: 4, nivel_aprendizagem: 1 },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("class_abilities", {
      id_classe: [1, 2],
    });
  },
};
