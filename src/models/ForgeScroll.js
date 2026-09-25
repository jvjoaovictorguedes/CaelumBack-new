const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const ForgeScroll = sequelize.define(
  "ForgeScroll",
  {
    id_item: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    bonus_percentual: { type: DataTypes.INTEGER, allowNull: false },
    nivel_forja_minimo: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    tempo_segundos: { type: DataTypes.INTEGER, allowNull: false },
    // Painel Administrativo da Forja §8 — pergaminho desativado some da
    // oferta de nova produção/seleção, mas permanece em inventários
    // existentes (nunca excluído fisicamente).
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "forge_scrolls", timestamps: false },
);

module.exports = ForgeScroll;
