const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Item = require("./Item");
const Power = require("./Power");

// Habilidades V2.0 §13 — Livro de Habilidade: aquisição rara de Power
// via Item (tipo_item="LivroHabilidade"). Uma linha = um livro concede
// UMA Power; requisitos são todos opcionais (null = sem exigência
// naquele campo), validados em conjunto por
// powerLearningService.validarRequisitosDoLivro. Nunca um sistema
// paralelo de "habilidades aprendidas" — o aprendizado termina sempre
// em CharacterAbilities, igual compra/classe/raça/evolução/Proeza.
const PowerBook = sequelize.define(
  "PowerBook",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_item: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      references: { model: Item, key: "id" },
    },
    id_power: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Power, key: "id" },
    },
    nivel_minimo: { type: DataTypes.INTEGER, allowNull: true },
    id_classe: { type: DataTypes.INTEGER, allowNull: true },
    id_raca: { type: DataTypes.INTEGER, allowNull: true },
    natureza_magica: {
      type: DataTypes.ENUM("Fogo", "Agua", "Terra", "Ar", "Luz", "Escuridao", "Raio", "Yin&Yang"),
      allowNull: true,
    },
    id_power_prerequisito: { type: DataTypes.INTEGER, allowNull: true },
    nivel_power_prerequisito: { type: DataTypes.INTEGER, allowNull: true },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "power_books" },
);

module.exports = PowerBook;
