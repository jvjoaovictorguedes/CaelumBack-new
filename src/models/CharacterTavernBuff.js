const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Sistema de Taverna §7.2 — buff temporário ATUAL do personagem, uma
// linha por categoria (Refeicao/Bebida). Snapshot de buff_key/magnitude
// no momento da compra — editar o TavernMenuItem depois nunca muda um
// buff já ativo em jogadores.
const CharacterTavernBuff = sequelize.define(
  "CharacterTavernBuff",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    categoria: { type: DataTypes.ENUM("Refeicao", "Bebida"), allowNull: false },
    buff_key: { type: DataTypes.STRING(40), allowNull: false },
    magnitude: { type: DataTypes.FLOAT, allowNull: false },
    source_menu_item_id: { type: DataTypes.INTEGER, allowNull: true },
    activated_at: { type: DataTypes.DATE, allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
  },
  { tableName: "character_tavern_buffs" },
);

module.exports = CharacterTavernBuff;
