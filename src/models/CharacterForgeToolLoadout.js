const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Profissão de Ferreiro §6 — 3 slots profissionais, independentes do
// equipamento de combate (mesmo critério de CharacterFishingLoadout: a
// instância apontada PERMANECE estado "Inventario", nunca "Equipada" —
// reservado pra combate). Uma linha por personagem.
const CharacterForgeToolLoadout = sequelize.define(
  "CharacterForgeToolLoadout",
  {
    id_personagem: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    id_instancia_fole: { type: DataTypes.INTEGER, allowNull: true },
    id_instancia_martelo: { type: DataTypes.INTEGER, allowNull: true },
    id_instancia_tenaz: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: "character_forge_tool_loadout" },
);

module.exports = CharacterForgeToolLoadout;
