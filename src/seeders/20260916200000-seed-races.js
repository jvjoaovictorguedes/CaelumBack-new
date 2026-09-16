"use strict";

// Dados PLACEHOLDER pra ambiente local/dev — inferidos do código do front
// (media-url.ts espera "humano", "elfo", "anao", "orc", "celestial").
// Se a produção tiver dados diferentes, troque este arquivo pelos reais.
module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      'SELECT COUNT(*)::int AS count FROM "Races";',
    );
    if (rows[0].count > 0) {
      console.log('[seed] "Races" já tem dados — pulando.');
      return;
    }

    await queryInterface.bulkInsert("Races", [
      {
        id: 1,
        nome_masculino: "Humano",
        nome_feminino: "Humana",
        descricao_masculina: "Versatil e adaptavel, o humano se destaca em qualquer caminho que escolher.",
        descricao_feminina: "Versatil e adaptavel, a humana se destaca em qualquer caminho que escolher.",
        bonus_forca: 2,
        bonus_vitalidade: 2,
        bonus_agilidade: 2,
        bonus_inteligencia: 2,
        bonus_velocidade: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        nome_masculino: "Elfo",
        nome_feminino: "Elfa",
        descricao_masculina: "Ligado a natureza e a magia, possui grande agilidade e intelecto.",
        descricao_feminina: "Ligada a natureza e a magia, possui grande agilidade e intelecto.",
        bonus_forca: 0,
        bonus_vitalidade: 1,
        bonus_agilidade: 4,
        bonus_inteligencia: 4,
        bonus_velocidade: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 3,
        nome_masculino: "Anao",
        nome_feminino: "Ana",
        descricao_masculina: "Resistente como a rocha, forjado para a guerra e o trabalho pesado.",
        descricao_feminina: "Resistente como a rocha, forjada para a guerra e o trabalho pesado.",
        bonus_forca: 4,
        bonus_vitalidade: 4,
        bonus_agilidade: 0,
        bonus_inteligencia: 1,
        bonus_velocidade: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 4,
        nome_masculino: "Orc",
        nome_feminino: "Orca",
        descricao_masculina: "Bruto e implacavel em combate, vive pela forca.",
        descricao_feminina: "Bruta e implacavel em combate, vive pela forca.",
        bonus_forca: 5,
        bonus_vitalidade: 3,
        bonus_agilidade: 1,
        bonus_inteligencia: -1,
        bonus_velocidade: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 5,
        nome_masculino: "Celestial",
        nome_feminino: "Celestial",
        descricao_masculina: "Uma linhagem lendaria de poder quase divino. Extremamente raro.",
        descricao_feminina: "Uma linhagem lendaria de poder quase divino. Extremamente raro.",
        bonus_forca: 3,
        bonus_vitalidade: 3,
        bonus_agilidade: 3,
        bonus_inteligencia: 5,
        bonus_velocidade: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("Races", { id: [1, 2, 3, 4, 5] });
  },
};
