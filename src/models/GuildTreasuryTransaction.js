const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const GuildTreasuryTransaction = sequelize.define(
  "GuildTreasuryTransaction",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    id_guild: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Guilds", key: "id" },
    },
    tipo: {
      type: DataTypes.ENUM("Doacao", "Gasto", "Estorno"),
      allowNull: false,
    },
    id_personagem: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "Characters", key: "id" },
    },
    valor: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    saldo_resultante: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    motivo: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    tableName: "GuildTreasuryTransactions",
    updatedAt: false,
  },
);

module.exports = GuildTreasuryTransaction;
