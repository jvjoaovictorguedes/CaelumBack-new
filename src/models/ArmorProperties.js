const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Item = require("./Item");

const ArmorProperties = sequelize.define("ArmorProperties", {
  id_item: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    references: {
      model: Item,
      key: "id",
    },
    allowNull: false,
  },
  // "Maos" segue no ENUM só por causa dos Escudos existentes — o ENUM
  // não tem um valor dedicado pra escudo, então eles usam "Maos" como
  // placeholder histórico (a validação de equipar nunca lê esse campo
  // pra Escudo, ver CharacterEquipmentController.validarCompatibilidade
  // e equipmentInstanceService.resolverSlot — Escudo sempre vai fixo
  // pra ArmaSecundaria). Peças de Armadura de verdade nunca mais usam
  // "Maos" — o slot de mãos como armadura própria foi descontinuado
  // (pedido do jogador, ver migration 20261019010000-remove-manoplas-luvas).
  slot_equipamento: {
    type: DataTypes.ENUM("Cabeca", "Torso", "Maos", "Pes", "Acessorio1", "Acessorio2"),
    allowNull: false,
  },
  defesa: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  bonus_forca: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  bonus_vitalidade: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  bonus_inteligencia: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  bonus_agilidade: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  bonus_velocidade: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
});

module.exports = ArmorProperties;
