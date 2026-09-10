const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const User = require("./User");
const Race = require("./Race");
const Class = require("./Class");
const Item = require("./Item");

const Character = sequelize.define("Character", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  id_usuario: {
    type: DataTypes.INTEGER,
    references: {
      model: User,
      key: "id",
    },
    allowNull: false,
  },
  nome: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  genero: {
    type: DataTypes.ENUM("Masculino", "Feminino"),
    allowNull: false,
  },
  nivel: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    allowNull: false,
  },
  experiencia: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  vida_atual: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  mana_atual: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  forca: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  vitalidade: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  agilidade: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  inteligencia: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  velocidade: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  dinheiro: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  pontos_distribuir: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: true,
  },
  reset: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: true,
  },
  natureza_magica: {
    type: DataTypes.ENUM(
      "Fogo",
      "Agua",
      "Terra",
      "Ar",
      "Luz",
      "Escuridao",
      "Raio",
      "Yin&Yang"
    ),
    allowNull: true,
  },
  rank: {
    type: DataTypes.STRING(50),
    defaultValue: "F",
    allowNull: true,
  },
  id_raca: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Race,
      key: "id",
    },
  },
  id_classe: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Class,
      key: "id",
    },
  },
  slot_cabeca_item_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Item,
      key: "id",
    },
  },
  slot_torso_item_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Item,
      key: "id",
    },
  },
  slot_maos_item_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Item,
      key: "id",
    },
  },
  slot_pes_item_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Item,
      key: "id",
    },
  },
  slot_arma_principal_item_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Item,
      key: "id",
    },
  },
  slot_arma_secundaria_item_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Item,
      key: "id",
    },
  },
  slot_acessorio1_item_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Item,
      key: "id",
    },
  },
  slot_acessorio2_item_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Item,
      key: "id",
    },
  },
});

module.exports = Character;
