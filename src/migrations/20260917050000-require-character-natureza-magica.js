"use strict";

// natureza_magica virou obrigatória — sempre sorteada pelo servidor na
// criação do personagem (characterController.createCharacter), nunca
// mais opcional/confiada ao cliente. Personagens antigos que já
// existiam sem esse campo preenchido (era allowNull:true antes)
// recebem um sorteio agora, com o mesmo peso usado pra personagens
// novos, antes de travar a coluna como NOT NULL.
const { sortearNaturezaMagica } = require("../services/naturezaMagicaService");

module.exports = {
  async up(queryInterface, Sequelize) {
    const [semNatureza] = await queryInterface.sequelize.query(
      'SELECT id FROM "Characters" WHERE natureza_magica IS NULL;',
    );

    for (const { id } of semNatureza) {
      await queryInterface.sequelize.query(
        'UPDATE "Characters" SET natureza_magica = :natureza WHERE id = :id;',
        { replacements: { natureza: sortearNaturezaMagica(), id } },
      );
    }

    await queryInterface.changeColumn("Characters", "natureza_magica", {
      type: Sequelize.ENUM,
      values: ["Fogo", "Agua", "Terra", "Ar", "Luz", "Escuridao", "Raio", "Yin&Yang"],
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("Characters", "natureza_magica", {
      type: Sequelize.ENUM,
      values: ["Fogo", "Agua", "Terra", "Ar", "Luz", "Escuridao", "Raio", "Yin&Yang"],
      allowNull: true,
    });
  },
};
