"use strict";

// IA de Combate PvE & Habilidades de Monstros V1 (§8.3/§11.1 item 5) —
// GuildBossAbility: habilidade de combate do chefe da guilda, uma Power
// por GuildBossConfig (um por Rank F..S). Mesma forma de
// monster_abilities, mas FK forte pra GuildBossConfig em vez de
// AdventureMonster — o adapter de Guild Boss converte pro DTO comum do
// combatAiService. Sem HEAL_HP/REGEN_HP/SHIELD aqui: a regra é
// validada no serviço (nunca só na migration), mas o schema já não deixa
// cadastrar a Power errada silenciosamente — ver monsterAbilityService.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("guild_boss_abilities", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_guild_boss_config: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "guild_boss_configs", key: "id" },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      id_power: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Powers", key: "id" },
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
      },
      prioridade_base: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      peso_uso: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      cooldown_override: { type: Sequelize.INTEGER, allowNull: true },
      custo_mana_override: { type: Sequelize.INTEGER, allowNull: true },
      target_policy: {
        type: Sequelize.ENUM("SELF", "PLAYER", "LOWEST_HP", "HIGHEST_HP", "RANDOM", "ALL"),
        allowNull: false,
        defaultValue: "PLAYER",
      },
      ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      ordem_admin: { type: Sequelize.INTEGER, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
    });

    await queryInterface.addConstraint("guild_boss_abilities", {
      fields: ["id_guild_boss_config", "id_power"],
      type: "unique",
      name: "guild_boss_abilities_config_power_unique",
    });
    await queryInterface.addConstraint("guild_boss_abilities", {
      fields: ["peso_uso"],
      type: "check",
      name: "guild_boss_abilities_peso_uso_positivo",
      where: { peso_uso: { [Sequelize.Op.gt]: 0 } },
    });
    await queryInterface.addIndex("guild_boss_abilities", ["id_guild_boss_config", "ativo"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("guild_boss_abilities");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_guild_boss_abilities_target_policy";');
  },
};
