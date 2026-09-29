const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Área de Caça do Modo Aventura (§3/§22 da spec) — nivel_monstro_min/max
// é só RECOMENDADO (faixa de nível dos monstros que aparecem lá, vira o
// badge de perigo na UI), nunca decide se o personagem pode entrar.
// nivel_jogador_minimo é o gate de verdade: entrar na zona (solo,
// adventureService.entrarNaZona, ou em grupo, partySocket "party:
// iniciar") exige character.nivel >= nivel_jogador_minimo.
const AdventureZone = sequelize.define(
  "AdventureZone",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    nome: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    descricao: { type: DataTypes.TEXT, allowNull: true },
    nivel_monstro_min: { type: DataTypes.INTEGER, allowNull: false },
    nivel_monstro_max: { type: DataTypes.INTEGER, allowNull: false },
    nivel_jogador_minimo: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    imagem_url: { type: DataTypes.STRING(255), allowNull: true },
    ordem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    ativa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    tableName: "AdventureZones",
  },
);

module.exports = AdventureZone;
