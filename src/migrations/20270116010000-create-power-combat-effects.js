"use strict";

// Habilidades V2.0 (doc "Habilidades V2.0" §7/§9/§17) — Fase 4. Cria
// power_combat_effects: modificadores de combate configuráveis de uma
// Power (buff/debuff numérico, escudo, regen, lifesteal, crítico, cura,
// Mana, cooldown, dispel, gatilho) — tudo que PowerStatusEffect não
// representa. effect_key/target/trigger/reapply_policy são sempre
// strings validadas pelos catálogos centrais (combatModifierConfig.js/
// combatTriggerConfig.js), nunca ENUM do banco — evita migration nova
// toda vez que o catálogo ganha uma chave (mesmo critério já usado por
// UniquePowerEffect.effect_key).
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();
    if (tabelas.includes("power_combat_effects")) return;

    await queryInterface.createTable("power_combat_effects", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_power: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Powers", key: "id" },
        onDelete: "CASCADE",
      },
      effect_key: { type: Sequelize.STRING(40), allowNull: false },
      target: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "SELF" },
      trigger: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "PASSIVE" },

      magnitude_base: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
      scale_attribute: {
        type: Sequelize.ENUM("Forca", "Vitalidade", "Agilidade", "Inteligencia", "Velocidade"),
        allowNull: true,
      },
      scale_value: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
      scale_with_ability_level: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },

      chance_ppm: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1_000_000 },
      duration_turns: { type: Sequelize.INTEGER, allowNull: true },

      stack_group: { type: Sequelize.STRING(60), allowNull: true },
      reapply_policy: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "STRONGEST" },
      max_stacks: { type: Sequelize.INTEGER, allowNull: true },

      condition_key: { type: Sequelize.STRING(40), allowNull: true },
      condition_config: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },

      dispellable: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      config: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },

      allow_pve: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      allow_party: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      allow_guild_boss: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      allow_world_boss: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      allow_pvp_casual: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      allow_ranked: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      allow_tournament: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },

      ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },

      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
    });

    await queryInterface.addIndex("power_combat_effects", ["id_power"]);
    await queryInterface.addIndex("power_combat_effects", ["effect_key"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("power_combat_effects");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_power_combat_effects_scale_attribute";');
  },
};
