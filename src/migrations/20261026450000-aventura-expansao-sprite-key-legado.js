"use strict";

// Expansão Aventura Beta §30 — mapeamento de sprite_key dos 9 monstros
// já existentes, pra bater com as pastas de sprite que o frontend já
// tinha hardcoded por NOME (spriteForEnemy.tsx). Só depois disso o
// frontend pode passar a resolver por sprite_key em vez de nome.
module.exports = {
  async up(queryInterface) {
    const MAPA = {
      "Lobo das Sombras": "Black_Werewolf",
      "Aranha Venenosa": "Spider_1",
      "Espectro Sussurrante": "Wraith_1",
      "Bandido Errante": "Bandit_1",
      "Cultista Renegado": "Cultist_1",
      "Golem de Pedra": "Golem_1",
      "Orc Guerreiro": "Orc_1",
      "Draconídeo Jovem": "Draconideo_1",
      Minotauro: "Minotaur_1",
    };

    for (const [nome, spriteKey] of Object.entries(MAPA)) {
      await queryInterface.sequelize.query(
        `UPDATE "AdventureMonsters" SET sprite_key = :spriteKey WHERE nome = :nome AND sprite_key IS NULL;`,
        { replacements: { spriteKey, nome } },
      );
    }
  },

  async down(queryInterface) {
    const nomes = [
      "Lobo das Sombras", "Aranha Venenosa", "Espectro Sussurrante", "Bandido Errante",
      "Cultista Renegado", "Golem de Pedra", "Orc Guerreiro", "Draconídeo Jovem", "Minotauro",
    ];
    await queryInterface.sequelize.query(
      `UPDATE "AdventureMonsters" SET sprite_key = NULL WHERE nome IN (:nomes);`,
      { replacements: { nomes } },
    );
  },
};
