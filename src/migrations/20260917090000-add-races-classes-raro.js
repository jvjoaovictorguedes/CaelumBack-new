"use strict";

// Sorteio de raça/classe rara (Celestial/Primordial) deixa de ser
// decidido no frontend (Math.random, e o cliente simplesmente mandando
// o id da raça/classe rara em POST /characters) e passa a depender
// deste campo: só uma linha com raro = true entra no sorteio do
// servidor, e só um "ticket" emitido por esse sorteio autoriza criar
// personagem com ela (ver raridadeRolagemService.js e
// characterController.createCharacter).
//
// O backfill marca como raras as linhas que já eram tratadas como raras
// no frontend (nome contendo "celestial"/"primordial"), preservando
// exatamente quais raças/classes são raras hoje.
module.exports = {
  async up(queryInterface, Sequelize) {
    const descricaoRaces = await queryInterface.describeTable("Races");
    if (!("raro" in descricaoRaces)) {
      await queryInterface.addColumn("Races", "raro", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
      await queryInterface.sequelize.query(`
        UPDATE "Races"
        SET raro = true
        WHERE LOWER(nome_masculino) LIKE '%celestial%'
           OR LOWER(nome_feminino) LIKE '%celestial%';
      `);
    } else {
      console.log('[migration] "Races"."raro" já existe — pulando.');
    }

    const descricaoClasses = await queryInterface.describeTable("Classes");
    if (!("raro" in descricaoClasses)) {
      await queryInterface.addColumn("Classes", "raro", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
      await queryInterface.sequelize.query(`
        UPDATE "Classes"
        SET raro = true
        WHERE LOWER(nome) LIKE '%celestial%' OR LOWER(nome) LIKE '%primordial%';
      `);
    } else {
      console.log('[migration] "Classes"."raro" já existe — pulando.');
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Races", "raro");
    await queryInterface.removeColumn("Classes", "raro");
  },
};
