"use strict";

// Ideia #3 do jogador (fila de melhorias) — monstros da Aventura passam a
// poder causar status effect no jogador, igual Power/Arma já causam no
// monstro. Opt-in por monstro (sem nenhuma linha aqui = monstro normal,
// só ataque básico), mesmo princípio de WeaponStatusEffect/
// PowerStatusEffect. Sem potency_scale_attribute de propósito: a
// Reformulação V2 dos Monstros (ver AdventureMonster.js) já estabeleceu
// que todo stat de monstro é FIXO, cadastrado direto pelo admin — nunca
// derivado de um atributo "Forca/Vitalidade/..." que o monstro nem tem
// (esses são campos de Character, não de AdventureMonster).
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();
    if (tabelas.includes("monster_status_effects")) return;

    await queryInterface.createTable("monster_status_effects", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_monstro: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "AdventureMonsters", key: "id" },
        onDelete: "CASCADE",
      },
      status_key: { type: Sequelize.STRING(20), allowNull: false },
      chance_ppm: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      duration_turns: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      potency_base: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
      ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addConstraint("monster_status_effects", {
      fields: ["id_monstro", "status_key"],
      type: "unique",
      name: "monster_status_effects_monstro_status_unique",
    });
    await queryInterface.addConstraint("monster_status_effects", {
      fields: ["chance_ppm"],
      type: "check",
      name: "monster_status_effects_chance_ppm_range",
      where: { chance_ppm: { [Sequelize.Op.gte]: 0, [Sequelize.Op.lte]: 1_000_000 } },
    });
    await queryInterface.addConstraint("monster_status_effects", {
      fields: ["duration_turns"],
      type: "check",
      name: "monster_status_effects_duration_positive",
      where: { duration_turns: { [Sequelize.Op.gt]: 0 } },
    });
    await queryInterface.addIndex("monster_status_effects", ["id_monstro"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("monster_status_effects");
  },
};
