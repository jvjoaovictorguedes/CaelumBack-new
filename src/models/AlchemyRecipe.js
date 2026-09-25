const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Domínio próprio de Alquimia (spec Caldeirão §3/§6.1) — NÃO é
// ForgeBlueprint. id_item_resultado referencia Item.id diretamente e
// precisa ser Item.tipo_item = "Consumivel" (validado em serviço, não
// aqui: o modelo não faz I/O).
const AlchemyRecipe = sequelize.define(
  "AlchemyRecipe",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    key: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    nome: { type: DataTypes.STRING(120), allowNull: false },
    descricao: { type: DataTypes.TEXT, allowNull: true },
    categoria: {
      type: DataTypes.ENUM("POCAO", "ANTIDOTO", "TONICO", "ELIXIR", "PREPARADO"),
      allowNull: false,
    },
    id_item_resultado: { type: DataTypes.INTEGER, allowNull: false },
    quantidade_resultado: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, validate: { min: 1 } },
    nivel_alquimia_minimo: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, validate: { min: 1 } },
    xp_alquimia: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
    custo_ouro: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
    modo_desbloqueio: { type: DataTypes.ENUM("NIVEL", "DESCOBERTA"), allowNull: false, defaultValue: "NIVEL" },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    ordem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: "alchemy_recipes" },
);

module.exports = AlchemyRecipe;
