"use strict";

// CharacterAbilities nunca teve um índice único em (id_personagem,
// id_power) — só uma PK própria (id) autoincrementada. Isso fazia
// bulkCreate({ ignoreDuplicates: true }) em concederPoderesIniciais não
// ter nada pra realmente ignorar: cada chamada da função pra um mesmo
// personagem inseria de novo as mesmas linhas. Enquanto a função só era
// chamada uma vez (na criação do personagem) isso nunca dava pra notar;
// virou bug de verdade quando passou a ser chamada de novo em
// getCharacterById pra sincronizar poderes novos de classe/raça.
module.exports = {
  async up(queryInterface) {
    // Remove duplicatas que já possam existir (mantém a linha mais
    // antiga de cada par personagem+poder) antes de criar o índice —
    // senão o CREATE UNIQUE INDEX falha se já tiver duplicata.
    await queryInterface.sequelize.query(`
      DELETE FROM "CharacterAbilities" a
      USING "CharacterAbilities" b
      WHERE a.id > b.id
        AND a.id_personagem = b.id_personagem
        AND a.id_power = b.id_power;
    `);

    const indexes = await queryInterface.showIndex("CharacterAbilities");
    const jaExiste = indexes.some(
      (indice) => indice.name === "character_abilities_personagem_power_unique",
    );
    if (!jaExiste) {
      await queryInterface.addIndex("CharacterAbilities", ["id_personagem", "id_power"], {
        unique: true,
        name: "character_abilities_personagem_power_unique",
      });
    } else {
      console.log('[migration] Índice único de CharacterAbilities já existe — pulando.');
    }
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      "CharacterAbilities",
      "character_abilities_personagem_power_unique",
    );
  },
};
