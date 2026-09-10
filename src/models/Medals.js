const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Medals = sequelize.define("Medals", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  nome: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  descricao: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  imagem_url: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  nivel_medalha: {
    type: DataTypes.ENUM("Bronze", "Prata", "Ouro"),
    allowNull: false,
  },
});

module.exports = Medals;
