const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Profissão de Ferreiro §4/§9.1 — camada de CONHECIMENTO sobre um
// ForgeBlueprint já existente (nunca duplica ingredientes/resultado/Tier
// — Blueprint continua a fonte de verdade técnica). id_blueprint é
// UNIQUE: um blueprint tem no máximo uma Receita associada (spec §4.2 —
// nível pra aprender = ForgeBlueprint.nivel_forja_minimo, sem curva
// paralela).
const ForgeRecipe = sequelize.define(
  "ForgeRecipe",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_blueprint: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    // Item físico (tipo_item "Receita") que o jogador precisa possuir e
    // consumir pra aprender — spec §5: "Receitas encontradas em
    // exploração devem entrar no inventário como Item".
    id_item: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    raridade_receita: { type: DataTypes.ENUM("Comum", "Raro", "Lendario"), allowNull: false },
    negociavel: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    consome_ao_aprender: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    pista_publica: { type: DataTypes.STRING(200), allowNull: true },
  },
  { tableName: "forge_recipes" },
);

module.exports = ForgeRecipe;
