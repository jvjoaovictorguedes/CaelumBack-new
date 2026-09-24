"use strict";

// Sistema de Conjuntos de Equipamentos §4-5 — 3 tabelas de catálogo:
//   equipment_sets         : o conjunto em si (key/nome/descricao/ativo)
//   equipment_set_pieces   : quais Items pertencem a qual conjunto,
//                            deduplicados por piece_key (identidade
//                            lógica da peça, não o id_item/instância)
//   equipment_set_bonuses  : thresholds (pieces_required) do conjunto,
//                            com stats numéricos (JSONB) e/ou uma
//                            passiva (effect_key + effect_config)
//
// Tamanho/thresholds são configuráveis por conjunto (nunca hardcoded
// "6 peças" em lugar nenhum) — ver equipmentSetService.js pra contagem
// e ativação.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("equipment_sets")) {
      await queryInterface.createTable("equipment_sets", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        key: { type: Sequelize.STRING(80), allowNull: false, unique: true },
        nome: { type: Sequelize.STRING(120), allowNull: false },
        descricao: { type: Sequelize.TEXT, allowNull: true },
        imagem_url: { type: Sequelize.STRING(255), allowNull: true },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    if (!tabelas.includes("equipment_set_pieces")) {
      await queryInterface.createTable("equipment_set_pieces", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        equipment_set_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "equipment_sets", key: "id" },
          onDelete: "CASCADE",
        },
        item_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Items", key: "id" },
          onDelete: "CASCADE",
        },
        // Identidade lógica deduplicável (ex.: "elmo_draconico") — o
        // contador de peças equipadas usa Set(piece_key), nunca
        // quantidade de linhas/instâncias equipadas (§6.3): um acessório
        // duplicado nos dois slots não conta duas vezes se ambos forem
        // a mesma peça lógica.
        piece_key: { type: Sequelize.STRING(100), allowNull: false },
        ordem: { type: Sequelize.INTEGER, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });

      await queryInterface.addConstraint("equipment_set_pieces", {
        fields: ["equipment_set_id", "item_id"],
        type: "unique",
        name: "equipment_set_pieces_set_item_unique",
      });
      await queryInterface.addConstraint("equipment_set_pieces", {
        fields: ["equipment_set_id", "piece_key"],
        type: "unique",
        name: "equipment_set_pieces_set_piecekey_unique",
      });
      await queryInterface.addIndex("equipment_set_pieces", ["item_id"]);
      await queryInterface.addIndex("equipment_set_pieces", ["equipment_set_id"]);
    }

    if (!tabelas.includes("equipment_set_bonuses")) {
      await queryInterface.createTable("equipment_set_bonuses", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        equipment_set_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "equipment_sets", key: "id" },
          onDelete: "CASCADE",
        },
        pieces_required: { type: Sequelize.INTEGER, allowNull: false },
        // Restrito aos atributos que equipmentBonusService já sabe
        // aplicar com segurança (§4.4) — sem interpretador genérico de
        // fórmulas: { forca, vitalidade, agilidade, inteligencia,
        // velocidade, defesa }.
        stats: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
        // Passiva resolvida por uma whitelist no código (§8.1/§13) —
        // nunca código armazenado no banco.
        effect_key: { type: Sequelize.STRING(100), allowNull: true },
        effect_config: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
        descricao: { type: Sequelize.TEXT, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });

      await queryInterface.addConstraint("equipment_set_bonuses", {
        fields: ["equipment_set_id", "pieces_required"],
        type: "unique",
        name: "equipment_set_bonuses_set_pieces_unique",
      });
      await queryInterface.addConstraint("equipment_set_bonuses", {
        fields: ["pieces_required"],
        type: "check",
        name: "equipment_set_bonuses_pieces_required_positive",
        where: { pieces_required: { [Sequelize.Op.gt]: 0 } },
      });
      await queryInterface.addIndex("equipment_set_bonuses", ["equipment_set_id"]);
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("equipment_set_bonuses");
    await queryInterface.dropTable("equipment_set_pieces");
    await queryInterface.dropTable("equipment_sets");
  },
};
