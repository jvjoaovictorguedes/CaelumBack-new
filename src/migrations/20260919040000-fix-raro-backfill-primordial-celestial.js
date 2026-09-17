"use strict";

// Correção de dado: a migração 20260917090000-add-races-classes-raro.js
// só rodava o UPDATE que marca Celestial/Primordial como raro=true UMA
// VEZ, no exato momento em que a coluna "raro" era criada (guardado por
// `if (!("raro" in descricao))`). Se a classe "Primordial" (ou uma raça
// Celestial) foi inserida DEPOIS que essa coluna já existia em produção
// — por um seeder rodado fora de ordem, por exemplo — ela nasceu com o
// valor padrão da coluna (raro=false) e nunca foi corrigida: aparecia
// pra qualquer jogador na tela normal de criação de personagem, sem
// nunca ter passado pelo sorteio de 0.9%.
//
// Esta migração reaplica o mesmo UPDATE incondicionalmente (não fica
// presa a "só roda se a coluna não existir") — idempotente, seguro de
// rodar em qualquer estado do banco, e corrige o dado errado sem
// precisar de acesso manual à base de produção.
module.exports = {
  async up(queryInterface) {
    const [resultadoRaces] = await queryInterface.sequelize.query(`
      UPDATE "Races"
      SET raro = true
      WHERE raro = false
        AND (LOWER(nome_masculino) LIKE '%celestial%' OR LOWER(nome_feminino) LIKE '%celestial%');
    `);
    const [resultadoClasses] = await queryInterface.sequelize.query(`
      UPDATE "Classes"
      SET raro = true
      WHERE raro = false
        AND LOWER(nome) LIKE '%primordial%';
    `);
    console.log(
      `[migration] raças corrigidas: ${resultadoRaces.rowCount ?? 0}, classes corrigidas: ${resultadoClasses.rowCount ?? 0}`,
    );
  },

  // Não reverte de propósito — não há como saber se uma linha raro=true
  // já era assim antes desta migração ou foi corrigida por ela, e
  // "desfazer" isso significaria reabrir o bug de expor Primordial/
  // Celestial fora do sorteio.
  async down() {},
};
