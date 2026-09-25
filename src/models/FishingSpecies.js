const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Catálogo de espécies de peixe (spec Pesca §8.1). id_item aponta pro
// Item stackável concedido na captura — a captura INDIVIDUAL (peso,
// data, zona) fica em FishingCatchRecord, nunca aqui.
const FishingSpecies = sequelize.define(
  "FishingSpecies",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    key: { type: DataTypes.STRING(60), allowNull: false, unique: true },
    id_item: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    nome_cientifico: { type: DataTypes.STRING(150), allowNull: true },
    descricao: { type: DataTypes.TEXT, allowNull: true },
    // Whitelist resolvida em fishingEngine.js — nunca código executável
    // vindo do banco (spec §14.5/§31).
    comportamento_key: {
      type: DataTypes.ENUM("CALM", "BURST", "ERRATIC", "ENDURANCE", "DEEP_DIVE"),
      allowNull: false,
    },
    dificuldade_base: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 1000 } },
    peso_min_g: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
    peso_max_g: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
    perfil_peso: { type: DataTypes.ENUM("LIGHT", "NORMAL", "HEAVY"), allowNull: false, defaultValue: "NORMAL" },
    pontos_base_torneio: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
    lendario: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "fishing_species" },
);

module.exports = FishingSpecies;
