"use strict";

// Habilidades V2.0 (doc "Habilidades V2.0" §4/§21) — Fase 5/7 (migração
// de magnitude de Status). Adiciona `percentual_vida_maxima` (nullable)
// em PowerStatusEffect/WeaponStatusEffect/MonsterStatusEffect — nunca
// reinterpreta `potency_base` existente como percentual (§21 "não fazer
// UPDATE genérico que trate '37 de dano' como '37% de HP'"). A coluna
// antiga (`potency_base`) continua coexistindo: enquanto
// `percentual_vida_maxima` for null numa linha, BURN/BLEED/POISON
// continuam usando o dano absoluto de sempre (statusEffectService.
// calcularDanoDoTick cai pro modo legado); só vira percentual quando o
// Admin configurar essa linha explicitamente.
module.exports = {
  async up(queryInterface, Sequelize) {
    for (const tabela of ["power_status_effects", "weapon_status_effects", "monster_status_effects"]) {
      const colunas = await queryInterface.describeTable(tabela);
      if (!colunas.percentual_vida_maxima) {
        await queryInterface.addColumn(tabela, "percentual_vida_maxima", {
          type: Sequelize.FLOAT,
          allowNull: true,
        });
      }
    }
  },

  async down(queryInterface) {
    for (const tabela of ["power_status_effects", "weapon_status_effects", "monster_status_effects"]) {
      const colunas = await queryInterface.describeTable(tabela);
      if (colunas.percentual_vida_maxima) {
        await queryInterface.removeColumn(tabela, "percentual_vida_maxima");
      }
    }
  },
};
