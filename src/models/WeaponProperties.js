const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Item = require("./Item");

const WeaponProperties = sequelize.define("WeaponProperties", {
  id_item: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    references: {
      model: Item,
      key: "id",
    },
    allowNull: false,
  },
  dano_min: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  dano_max: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  tipo_dano: {
    type: DataTypes.ENUM("Fisico", "Magico"),
    allowNull: false,
  },
  tipo_arma: {
    type: DataTypes.ENUM(
      "Espada",
      "Machado",
      "Cajado",
      "Adaga",
      "Lança",
      "Orbe"
    ),
    allowNull: false,
  },
  bonus_atributo: {
    type: DataTypes.ENUM(
      "Forca",
      "Vitalidade",
      "Inteligencia",
      "Agilidade",
      "Velocidade"
    ),
    allowNull: false,
  },
  valor_bonus_atributo: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
    allowNull: false,
  },
});

module.exports = WeaponProperties;
