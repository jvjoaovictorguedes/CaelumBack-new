const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Character = require("./Character");
const Item = require("./Item");

const CharacterEquipment = sequelize.define(
  "CharacterEquipment",
  {
    id_personagem: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      references: {
        model: Character,
        key: "id",
      },
    },
    slot: {
      // "Maos" removido do catálogo em uso (pedido do jogador — arma
      // numa mão, escudo na outra, não sobra terceira mão pra uma peça
      // de armadura separada). O tipo ENUM do banco ainda tem esse
      // valor histórico (Postgres não permite remover valor de ENUM
      // sem recriar o tipo, risco desnecessário aqui), mas nenhum código
      // da aplicação grava "Maos" nessa coluna nunca mais.
      type: DataTypes.ENUM(
        "Cabeca",
        "Torso",
        "Pes",
        "ArmaPrincipal",
        "ArmaSecundaria",
        "Acessorio1",
        "Acessorio2",
      ),
      allowNull: false,
      primaryKey: true,
    },
    id_item: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Item,
        key: "id",
      },
    },
  },
  {
    tableName: "character_equipment",
    timestamps: false,
  },
);

module.exports = CharacterEquipment;
