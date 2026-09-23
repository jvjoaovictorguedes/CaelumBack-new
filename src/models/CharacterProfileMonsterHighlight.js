const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Character = require("./Character");
const AdventureMonster = require("./AdventureMonster");

// Até 3 criaturas favoritas do Bestiário no Perfil (§19/§29). Referencia
// AdventureMonster.id, mas a validação de "já descoberto" é feita pelo
// NOME atual do catálogo (CharacterMonsterKill é keyed por nome, não
// por id — ver characterProfileService).
const CharacterProfileMonsterHighlight = sequelize.define(
  "CharacterProfileMonsterHighlight",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Character, key: "id" },
    },
    slot: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 3 } },
    id_monstro: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: AdventureMonster, key: "id" },
    },
  },
  {
    tableName: "character_profile_monster_highlights",
    indexes: [
      { unique: true, fields: ["id_personagem", "slot"] },
      { unique: true, fields: ["id_personagem", "id_monstro"] },
    ],
  },
);

module.exports = CharacterProfileMonsterHighlight;
