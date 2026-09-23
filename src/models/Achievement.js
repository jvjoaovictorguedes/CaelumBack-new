const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Conquista — dá prestígio/identidade, nunca stats (Especificação
// Perfil de Jogador, §21/§22). `key` é o identificador ESTÁVEL usado
// pelo achievementService (grantByKey); `nome`/`descricao` são só
// exibição e podem mudar sem quebrar nada.
const Achievement = sequelize.define(
  "Achievement",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    key: { type: DataTypes.STRING(60), allowNull: false, unique: true },
    nome: { type: DataTypes.STRING(100), allowNull: false },
    descricao: { type: DataTypes.TEXT, allowNull: false },
    icone_url: { type: DataTypes.STRING(255), allowNull: true },
    categoria: { type: DataTypes.STRING(40), allowNull: false },
    ativa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "achievements" },
);

module.exports = Achievement;
