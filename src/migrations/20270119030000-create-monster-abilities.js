"use strict";

// IA de Combate PvE & Habilidades de Monstros V1 (§4.2) — vínculo de uma
// Power (usage_scope MONSTER/BOTH) a um AdventureMonster como habilidade
// de combate. Uma linha por Power vinculada; comportamento condicional
// (ex.: "só usa abaixo de 40% de vida") fica em monster_ability_conditions,
// nunca duplicando a Power aqui pra cada variação.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("monster_abilities", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_monstro: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "AdventureMonsters", key: "id" },
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

    await queryInterface.addConstraint("monster_abilities", {
      fields: ["id_monstro", "id_power"],
      type: "unique",
      name: "monster_abilities_id_monstro_id_power_unique",
    });
    await queryInterface.addConstraint("monster_abilities", {
      fields: ["peso_uso"],
      type: "check",
      name: "monster_abilities_peso_uso_positivo",
      where: { peso_uso: { [Sequelize.Op.gt]: 0 } },
    });
    await queryInterface.addIndex("monster_abilities", ["id_monstro", "ativo"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("monster_abilities");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_monster_abilities_target_policy";');
  },
};
