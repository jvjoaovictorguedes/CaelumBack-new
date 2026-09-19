"use strict";

// Espólios de monstro (§15 da spec do Modo Aventura) merecem categoria
// própria — senão viram só mais um "Material" indistinguível dos
// recursos de Mineração/Silvicultura/Exploração, o que a própria spec
// pede pra evitar (§14: Aventura não deve se sobrepor à Expedição).
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_Items_tipo_item" ADD VALUE IF NOT EXISTS 'Espolio';
    `);
  },

  async down() {
    // Postgres não suporta remover valor de ENUM sem recriar o tipo —
    // não vale o risco de recriar "enum_Items_tipo_item" (usado em toda
    // a tabela Items) só pra reverter uma migration aditiva.
  },
};
