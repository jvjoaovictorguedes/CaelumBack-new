"use strict";

// Placeholder — inferido de getClassImage() no front (espera "mago" e
// "guerreiro"/"guerreira" no nome pra escolher a imagem certa).
module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      'SELECT COUNT(*)::int AS count FROM "Classes";',
    );
    if (rows[0].count > 0) {
      console.log('[seed] "Classes" já tem dados — pulando.');
      return;
    }

    await queryInterface.bulkInsert("Classes", [
      {
        id: 1,
        nome: "Guerreiro",
        descricao: "Especialista em combate corpo a corpo, forte e resistente.",
        multiplicador_vida_por_nivel: 1.3,
        multiplicador_mana_por_nivel: 0.7,
        multiplicador_dano_fisico: 1.2,
        multiplicador_dano_magico: 0.6,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        nome: "Mago",
        descricao: "Mestre dos poderes arcanos, depende de mana pra vencer batalhas.",
        multiplicador_vida_por_nivel: 0.8,
        multiplicador_mana_por_nivel: 1.4,
        multiplicador_dano_fisico: 0.5,
        multiplicador_dano_magico: 1.3,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("Classes", { id: [1, 2] });
  },
};
