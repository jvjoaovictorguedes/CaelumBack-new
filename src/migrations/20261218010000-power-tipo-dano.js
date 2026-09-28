"use strict";

// Classes V2 (§4) — separa TIPO DE DANO da ESCALA de atributo. Antes o
// motor inferia "Inteligência = mágico, resto = físico" direto em
// combatFormulas.js — um poder de Agilidade nunca podia ser mágico (ex.:
// Lâmina Sombria) nem um poder de Força podia ser mágico (ex.: Golpe
// Sagrado). Nullable no Expand; backfill conservador logo em seguida
// (mesma migration, então nunca existe uma janela com valor deploy-visível
// nulo); NOT NULL só depois do backfill.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Powers", "tipo_dano", {
      type: Sequelize.ENUM("Fisico", "Magico", "Verdadeiro", "Nenhum"),
      allowNull: true,
    });

    // Backfill conservador (spec §4, regra de migração):
    //   - tem dano_base > 0 e escala Inteligencia -> Magico (era o que o
    //     motor antigo já fazia na prática, via inferência).
    //   - tem dano_base > 0 e qualquer outra escala -> Fisico (idem).
    //   - sem dano (cura/passivo puro) -> Nenhum.
    // Casos especiais (poder de Agilidade que deveria ser mágico, etc.)
    // ficam com o valor conservador até o Admin revisar — nenhum poder
    // muda de comportamento em combate só por causa desta migration.
    await queryInterface.sequelize.query(`
      UPDATE "Powers" SET tipo_dano = 'Nenhum'
      WHERE (dano_base IS NULL OR dano_base <= 0);
    `);
    await queryInterface.sequelize.query(`
      UPDATE "Powers" SET tipo_dano = 'Magico'
      WHERE dano_base > 0 AND escala_atributo = 'Inteligencia';
    `);
    await queryInterface.sequelize.query(`
      UPDATE "Powers" SET tipo_dano = 'Fisico'
      WHERE dano_base > 0 AND escala_atributo <> 'Inteligencia';
    `);

    await queryInterface.changeColumn("Powers", "tipo_dano", {
      type: Sequelize.ENUM("Fisico", "Magico", "Verdadeiro", "Nenhum"),
      allowNull: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Powers", "tipo_dano");
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_Powers_tipo_dano";`);
  },
};
