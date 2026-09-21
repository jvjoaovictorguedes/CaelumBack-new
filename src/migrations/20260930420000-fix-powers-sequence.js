"use strict";

// Corrige a sequence de autoincremento de "Powers". O seeder antigo
// (20260916220000-seed-powers.js) insere os 4 poderes iniciais com id
// fixo na mão (1-4), o que não avança a sequence do Postgres — ela
// continua contando a partir de 0/1. Quando uma migration depois disso
// insere um novo poder confiando em DEFAULT/autoincrement (sem id
// explícito), o Postgres tenta reusar um id que já existe e explode com
// "duplicar valor da chave viola a restrição de unicidade Powers_pkey".
// Sincroniza aqui, antes de qualquer migration que insira poderes assim
// (poderes-passivos, muitos-poderes-novos, evolucoes-naturezas-restantes).
// Idempotente e seguro de rodar quantas vezes for preciso.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `SELECT setval(pg_get_serial_sequence('"Powers"', 'id'), COALESCE((SELECT MAX(id) FROM "Powers"), 1), true);`,
    );
    console.log('[migration] Sequence de "Powers" sincronizada com o maior id existente.');
  },

  async down() {
    console.log("[migration] down() é um no-op — sincronizar sequence não precisa ser revertido.");
  },
};
