const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Catálogo de monstros do Modo Aventura — não existia nenhum catálogo
// de monstro antes disso (Aventura sempre gerou um nome sorteado de uma
// lista fixa em combatController.js, calibrado só pelos atributos do
// jogador). Cada linha aqui é um PERFIL de combate (§9 da spec): os
// multiplicadores entram em cima da calibração padrão de gerarInimigo
// (ver adventureEncounterService.js), dando identidade sem inventar uma
// escala de poder paralela.
const AdventureMonster = sequelize.define(
  "AdventureMonster",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    nome: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    descricao: { type: DataTypes.TEXT, allowNull: true },
    imagem_url: { type: DataTypes.STRING(255), allowNull: true },
    multiplicador_vida: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1 },
    multiplicador_dano: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1 },
    multiplicador_agilidade: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1 },
    multiplicador_velocidade: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1 },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    tableName: "AdventureMonsters",
  },
);

module.exports = AdventureMonster;
