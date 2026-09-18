"use strict";

// Continuação de 20260919040000-fix-raro-backfill-primordial-celestial.js
// — aquela migração corrigia raças "celestial" e classes "primordial"
// marcadas como raro=false por engano, mas não previa que "Primordial"
// também existisse como RAÇA (não só classe). Resultado: a raça
// Primordial nascia com raro=false (valor padrão da coluna) e aparecia
// pra qualquer jogador na grade normal de "Escolha sua Raça", sem
// nunca ter passado pelo sorteio de 0.9% — exatamente o mesmo bug de
// antes, só que num nome que a correção anterior não cobria.
module.exports = {
  async up(queryInterface) {
    const [resultado] = await queryInterface.sequelize.query(`
      UPDATE "Races"
      SET raro = true
      WHERE raro = false
        AND (LOWER(nome_masculino) LIKE '%primordial%' OR LOWER(nome_feminino) LIKE '%primordial%');
    `);
    console.log(`[migration] raças Primordial corrigidas: ${resultado.rowCount ?? 0}`);
  },

  // Não reverte de propósito — mesmo raciocínio da migração anterior:
  // não dá pra saber se a linha já era raro=true antes desta correção.
  async down() {},
};
