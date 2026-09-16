"use strict";

// Só a raça Celestial (id 5) tem poder próprio: Julgamento Divino (id 3).
module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      'SELECT COUNT(*)::int AS count FROM "RaceAbilities";',
    );
    if (rows[0].count > 0) {
      console.log('[seed] "RaceAbilities" já tem dados — pulando.');
      return;
    }

    await queryInterface.bulkInsert("RaceAbilities", [
      {
        id_raca: 5,
        id_power: 3,
        nivel_aprendizado: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("RaceAbilities", { id_raca: 5 });
  },
};
