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
    validate: { min: 0 },
  },
  dano_max: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
    validate: { min: 0 },
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
  // INTEGER pra combinar com as colunas de bônus equivalentes em
  // ArmorProperties (bonus_forca/bonus_vitalidade/...) — bug real:
  // migrations antigas de forja arredondavam pra 1 casa decimal em vez
  // de inteiro (1.1/1.3/1.5...), e como a coluna era FLOAT o Postgres
  // deixava passar. Ver migration 20261101020000.
  valor_bonus_atributo: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
});

module.exports = WeaponProperties;
