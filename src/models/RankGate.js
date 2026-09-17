const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Um Portal por ranque (exceto S++, que é o teto e não tem portal pra
// "sair dele"). `rank` é o ranque que o personagem TEM quando tenta —
// vencer promove pro próximo da escada (ver rankService.js).
const RankGate = sequelize.define(
  "RankGate",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    rank: {
      type: DataTypes.STRING(10),
      allowNull: false,
      unique: true,
    },
    nome_chefe: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    descricao: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    nivel_recomendado: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    vida: { type: DataTypes.INTEGER, allowNull: false },
    forca: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    vitalidade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    agilidade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    inteligencia: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    velocidade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    defesa: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    recompensa_dinheiro: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    recompensa_xp: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    imagem_url: { type: DataTypes.STRING(255), allowNull: true },
  },
  {
    tableName: "rank_gates",
  },
);

module.exports = RankGate;
