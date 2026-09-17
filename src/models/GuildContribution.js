const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const GuildContribution = sequelize.define(
  "GuildContribution",
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
    id_personagem: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Characters", key: "id" },
    },
    ouro_doado_total: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    contribuicao_total: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    contribuicao_temporada: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    // Controla o teto diário de XP de guilda gerado por doação (100 ouro
    // = 1 XP, até 50 XP/dia por personagem) sem precisar de outra tabela.
    xp_doacao_hoje: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    data_ultimo_xp_doacao: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
  },
  {
    tableName: "GuildContributions",
    indexes: [{ unique: true, fields: ["id_guild", "id_personagem"] }],
  },
);

module.exports = GuildContribution;
