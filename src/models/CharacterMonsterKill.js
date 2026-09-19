const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// 1 linha por (personagem, nome do monstro) — ver comentário na
// migration 20260930530000 sobre pra que serve.
const CharacterMonsterKill = sequelize.define(
  "CharacterMonsterKill",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    id_personagem: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    nome_monstro: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    quantidade: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: "character_monster_kills",
    indexes: [
      {
        unique: true,
        fields: ["id_personagem", "nome_monstro"],
        name: "character_monster_kills_personagem_monstro_unique",
      },
    ],
  },
);

module.exports = CharacterMonsterKill;
