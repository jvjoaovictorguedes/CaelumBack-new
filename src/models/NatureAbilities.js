const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Power = require("./Power");

// Mesmo padrão de ClassAbilities/RaceAbilities — só que a chave não tem
// tabela própria: Natureza Mágica é o ENUM já usado em Character.natureza_magica
// e Evolution.natureza_magica.
const NatureAbilities = sequelize.define(
  "NatureAbilities",
  {
    natureza_magica: {
      type: DataTypes.ENUM(
        "Fogo",
        "Agua",
        "Terra",
        "Ar",
        "Luz",
        "Escuridao",
        "Raio",
        "Yin&Yang",
      ),
      primaryKey: true,
      allowNull: false,
    },
    id_poder: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      references: {
        model: Power,
        key: "id",
      },
      allowNull: false,
    },
    nivel_aprendizagem: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      allowNull: false,
    },
    // NULL = libera de graça ao bater o nível (comportamento de sempre).
    // Com valor = precisa comprar na aba Habilidades (ver comprarPoder em
    // characterController.js).
    custo_ouro: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: "nature_abilities",
    timestamps: false,
  }
);

module.exports = NatureAbilities;
