"use strict";

// Evolução do Motor de Status §12.1 — efeitos de status configuráveis
// por ARMA (opt-in: arma sem nenhuma linha aqui é uma arma normal). FK
// aponta pra WeaponProperties.id_item (não Item.id direto) — reforça no
// schema que só um item com registro de arma pode receber esses efeitos.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();
    if (tabelas.includes("weapon_status_effects")) return;

    await queryInterface.createTable("weapon_status_effects", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_item: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "WeaponProperties", key: "id_item" },
        onDelete: "CASCADE",
      },
      status_key: { type: Sequelize.STRING(20), allowNull: false },
      chance_ppm: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      duration_turns: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      potency_base: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
      potency_scale_attribute: {
        type: Sequelize.ENUM("Forca", "Vitalidade", "Agilidade", "Inteligencia", "Velocidade"),
        allowNull: true,
      },
      potency_scale_value: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
      // v1 só tem um trigger válido (BASIC_ATTACK_HIT) — coluna já existe
      // pra não precisar de migration estrutural quando/se outro trigger
      // for adicionado (§13/§22 "sem hardcode escondido").
      trigger: { type: Sequelize.STRING(30), allowNull: false, defaultValue: "BASIC_ATTACK_HIT" },
      ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addConstraint("weapon_status_effects", {
      fields: ["id_item", "status_key", "trigger"],
      type: "unique",
      name: "weapon_status_effects_item_status_trigger_unique",
    });
    await queryInterface.addConstraint("weapon_status_effects", {
      fields: ["chance_ppm"],
      type: "check",
      name: "weapon_status_effects_chance_ppm_range",
      where: { chance_ppm: { [Sequelize.Op.gte]: 0, [Sequelize.Op.lte]: 1_000_000 } },
    });
    await queryInterface.addConstraint("weapon_status_effects", {
      fields: ["duration_turns"],
      type: "check",
      name: "weapon_status_effects_duration_positive",
      where: { duration_turns: { [Sequelize.Op.gt]: 0 } },
    });
    await queryInterface.addIndex("weapon_status_effects", ["id_item"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("weapon_status_effects");
  },
};
