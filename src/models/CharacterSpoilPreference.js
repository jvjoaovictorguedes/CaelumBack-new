const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Balcão de Espólios §4.3/§4.4/§8.2 — preferências de venda por espólio,
// guardadas FORA do stack de CharacterInventory de propósito: se a
// quantidade do item cair a zero (venda total, uso em crafting), a
// reserva/proteção continua existindo pra quando o jogador voltar a ter
// o item, em vez de se perder junto com a linha do inventário.
const CharacterSpoilPreference = sequelize.define(
  "CharacterSpoilPreference",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    id_item: { type: DataTypes.INTEGER, allowNull: false },
    protegido_venda: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    quantidade_reservada: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    tableName: "character_spoil_preferences",
  },
);

module.exports = CharacterSpoilPreference;
