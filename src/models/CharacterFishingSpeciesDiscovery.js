const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Descoberta de espécie por personagem (spec §20 — Almanaque Marinho,
// implementado nesta fase só como DADO: a UI do Almanaque em si fica
// pra uma fase futura, ver relatório final). Mesma ideia de
// CharacterMonsterKill do Bestiário: 1a captura marca `descoberto_em` e
// nunca é apagada; maior_peso_g guarda o recorde pessoal.
const CharacterFishingSpeciesDiscovery = sequelize.define(
  "CharacterFishingSpeciesDiscovery",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    id_species: { type: DataTypes.INTEGER, allowNull: false },
    descoberto_em: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    total_capturado: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    maior_peso_g: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    tableName: "character_fishing_species_discoveries",
    indexes: [{ unique: true, fields: ["id_personagem", "id_species"] }],
  },
);

module.exports = CharacterFishingSpeciesDiscovery;
