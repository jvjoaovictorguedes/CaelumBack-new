const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Item = require("./Item");

const ConsumableProperties = sequelize.define(
  "ConsumableProperties",
  {
    id_item: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      references: {
        model: Item,
        key: "id",
      },
      allowNull: false,
    },
    efeito_vida: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    efeito_mana: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    efeito_atributo: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    valor_atributo: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    duracao_efeito: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    // Poção de Reset de Atributos — devolve todo ponto livre já
    // distribuído, respeitando o piso da raça (attributeService
    // .resetarAtributos). Mutuamente exclusivo com efeito_atributo, mesma
    // regra que já existe entre efeito_vida/efeito_mana x efeito_atributo
    // (ver limparAtributoDePocaoDeCura em adminItemService.js).
    efeito_reset_atributos: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
  },
  {
    tableName: "consumable_properties",
    timestamps: false,
  }
);

module.exports = ConsumableProperties;
