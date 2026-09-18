const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Class = require("./Class");
const Power = require("./Power");

const ClassAbilities = sequelize.define(
  "ClassAbilities",
  {
    id_classe: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      references: {
        model: Class,
        key: "id",
      },
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
    // characterController.js) — usado pelos poderes Passivos novos.
    custo_ouro: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: "class_abilities",
    timestamps: false,
  }
);

module.exports = ClassAbilities;
