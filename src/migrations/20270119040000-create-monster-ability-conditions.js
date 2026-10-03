"use strict";

// IA de Combate PvE & Habilidades de Monstros V1 (§4.3) — condição
// opcional sobre uma MonsterAbility. condition_key é SEMPRE whitelist
// backend (config/monsterAbilityConfig.js) — nunca expressão livre;
// config guarda só parâmetros conhecidos do schema daquela chave (ex.:
// { thresholdPct: 40 }). required:true torna a ação INELEGÍVEL quando a
// condição falha; required:false só soma/subtrai score_bonus.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("monster_ability_conditions", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_monster_ability: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "monster_abilities", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      condition_key: { type: Sequelize.STRING(40), allowNull: false },
      config: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      score_bonus: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      required: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
    });

    await queryInterface.addIndex("monster_ability_conditions", ["id_monster_ability", "ativo"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("monster_ability_conditions");
  },
};
