"use strict";

// Reforma "Admin de Aventura + Defesa/Poder de Monstros" (Especificação
// v3) — adiciona o atributo Defesa aos monstros. Usa exatamente a mesma
// regra de mitigação já usada pelo motor de combate (aplicarMitigacaoDeDefesa/
// CONSTANTE_MITIGACAO_DEFESA em combatFormulas.js) — nenhuma fórmula
// nova. Default 0 preserva o comportamento atual de TODOS os monstros
// existentes até o Admin ajustar caso a caso.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      "AdventureMonsters",
      "defesa",
      { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      // Backfill implícito: addColumn com defaultValue já preenche as
      // linhas existentes com 0 no próprio ALTER TABLE (Postgres
      // moderno faz isso sem reescrever a tabela linha a linha).
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE "AdventureMonsters" ADD CONSTRAINT adventure_monsters_defesa_nao_negativa CHECK (defesa >= 0);`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE "AdventureMonsters" DROP CONSTRAINT IF EXISTS adventure_monsters_defesa_nao_negativa;`,
    );
    await queryInterface.removeColumn("AdventureMonsters", "defesa");
  },
};
