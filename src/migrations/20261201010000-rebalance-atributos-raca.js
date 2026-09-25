"use strict";

// Rebalanceamento de atributos iniciais por raça, pedido explícito do
// usuário pro Beta. Esses bônus são somados aos atributos base do
// personagem só no momento da criação (characterController.js) — não
// afeta personagens já existentes, só quem for criado a partir de
// agora.
const NOVOS_BONUS = {
  Humano: { bonus_forca: 5, bonus_vitalidade: 5, bonus_agilidade: 5, bonus_inteligencia: 5, bonus_velocidade: 5 },
  Elfo: { bonus_forca: 5, bonus_vitalidade: 3, bonus_agilidade: 7, bonus_inteligencia: 7, bonus_velocidade: 3 },
  Orc: { bonus_forca: 8, bonus_vitalidade: 8, bonus_agilidade: 3, bonus_inteligencia: 3, bonus_velocidade: 3 },
  Anao: { bonus_forca: 6, bonus_vitalidade: 9, bonus_agilidade: 3, bonus_inteligencia: 4, bonus_velocidade: 3 },
};

module.exports = {
  async up(queryInterface) {
    for (const [nome, bonus] of Object.entries(NOVOS_BONUS)) {
      await queryInterface.sequelize.query(
        `UPDATE "Races"
         SET bonus_forca = :bonus_forca,
             bonus_vitalidade = :bonus_vitalidade,
             bonus_agilidade = :bonus_agilidade,
             bonus_inteligencia = :bonus_inteligencia,
             bonus_velocidade = :bonus_velocidade,
             "updatedAt" = now()
         WHERE nome_masculino = :nome AND raro = false;`,
        { replacements: { nome, ...bonus } },
      );
    }
  },

  async down(queryInterface) {
    const BONUS_ANTIGOS = {
      Humano: { bonus_forca: 2, bonus_vitalidade: 2, bonus_agilidade: 2, bonus_inteligencia: 2, bonus_velocidade: 2 },
      Elfo: { bonus_forca: 0, bonus_vitalidade: 1, bonus_agilidade: 4, bonus_inteligencia: 4, bonus_velocidade: 1 },
      Orc: { bonus_forca: 5, bonus_vitalidade: 3, bonus_agilidade: 1, bonus_inteligencia: -1, bonus_velocidade: 2 },
      Anao: { bonus_forca: 4, bonus_vitalidade: 4, bonus_agilidade: 0, bonus_inteligencia: 1, bonus_velocidade: 1 },
    };
    for (const [nome, bonus] of Object.entries(BONUS_ANTIGOS)) {
      await queryInterface.sequelize.query(
        `UPDATE "Races"
         SET bonus_forca = :bonus_forca,
             bonus_vitalidade = :bonus_vitalidade,
             bonus_agilidade = :bonus_agilidade,
             bonus_inteligencia = :bonus_inteligencia,
             bonus_velocidade = :bonus_velocidade,
             "updatedAt" = now()
         WHERE nome_masculino = :nome AND raro = false;`,
        { replacements: { nome, ...bonus } },
      );
    }
  },
};
