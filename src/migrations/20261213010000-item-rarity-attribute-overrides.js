"use strict";

// Override por Item+Raridade dos atributos que a Forja aplica na
// instância crafada. Hoje (spec V2 §5) TODO item/blueprint usa a mesma
// curva global RARITY_POWER_MULTIPLIER (equipmentTierConfig.js) — este
// override permite ao admin fixar valores diferentes pra um item
// específico numa raridade específica, sem mexer na curva global.
//
// Chave é id_item (não id_blueprint): equipmentRarityService (única
// autoridade pra aplicar raridade em runtime, ver header do arquivo)
// só enxerga o Item + raridade da instância, nunca sabe qual blueprint
// originou a cópia — CharacterEquipmentInstance não guarda id_blueprint.
// Como ForgeBlueprint.id_item_resultado já é o item canônico e único
// que aquele blueprint produz, editar "o override do blueprint X" no
// admin é, na prática, editar o override do id_item_resultado dele —
// não muda a semântica, só onde o dado mora (o lugar que o runtime
// já sabe consultar sem precisar de mais nenhum join).
//
// "atributos" é parcial por design: só as chaves presentes aqui
// substituem o valor calculado pela curva global; qualquer atributo
// omitido continua vindo do multiplicador padrão. Isso deixa o admin
// ajustar só o que importa (ex.: só dano_max de uma arma lendária)
// sem precisar preencher o resto.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("item_rarity_attribute_overrides", {
      id_item: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        references: { model: "Items", key: "id" },
        onDelete: "CASCADE",
      },
      qualidade: {
        type: Sequelize.ENUM("Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"),
        allowNull: false,
        primaryKey: true,
      },
      atributos: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("item_rarity_attribute_overrides");
  },
};
