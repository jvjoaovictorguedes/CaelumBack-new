const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Sessão de caça (§16/§18) — enquanto ativa, todo encontro PvE do
// personagem pertence à mesma área (ver gate em
// combatController.gerarInimigoParaPersonagem). "Só uma ativa por
// personagem" é garantido em código (adventureService.entrarNaZona
// sempre encerra a anterior antes de criar uma nova), não por
// constraint de banco — mantém a migration simples e portátil.
const CharacterAdventureSession = sequelize.define(
  "CharacterAdventureSession",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    id_area: { type: DataTypes.INTEGER, allowNull: false },
    iniciado_em: { type: DataTypes.DATE, allowNull: false },
    encerrado_em: { type: DataTypes.DATE, allowNull: true },
    monstros_derrotados: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    raros_encontrados: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    xp_obtida: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    ouro_obtido: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    espolios_obtidos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    tableName: "CharacterAdventureSessions",
  },
);

module.exports = CharacterAdventureSession;
