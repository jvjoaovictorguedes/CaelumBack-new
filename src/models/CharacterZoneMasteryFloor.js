const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// "Piso" histórico de Maestria Regional (Expansão Aventura Beta §35) —
// existe só pra impedir que ampliar o catálogo de uma área (adicionar
// monstro novo a uma zona que já existia) reduza silenciosamente o
// nível de Maestria de quem já tinha completado o Bestiário antigo
// daquela região: calcularMaestriaDaRegiao (masteryService.js) volta
// SEMPRE max(nível recalculado ao vivo, piso salvo aqui), nunca menos.
// Backfilled uma única vez, na migration que expande o catálogo, com o
// nível que cada personagem já tinha ANTES do catálogo crescer — nunca
// escrito fora dali (não é um cache do nível atual, só um teto mínimo).
const CharacterZoneMasteryFloor = sequelize.define(
  "CharacterZoneMasteryFloor",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    id_area: { type: DataTypes.INTEGER, allowNull: false },
    nivel_piso: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    tableName: "CharacterZoneMasteryFloors",
    indexes: [
      { unique: true, fields: ["id_personagem", "id_area"], name: "character_zone_mastery_floor_unique" },
    ],
  },
);

module.exports = CharacterZoneMasteryFloor;
