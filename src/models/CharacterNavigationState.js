const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Localização atual do personagem DENTRO do domínio marítimo (spec
// §18.2) — não substitui a localização geral do personagem no mapa.
// V1: viagem instantânea (spec §18.3 permite explicitamente), então isto
// só guarda "onde ele está agora" pra gate de pesca.
const CharacterNavigationState = sequelize.define(
  "CharacterNavigationState",
  {
    id_personagem: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    id_port_atual: { type: DataTypes.INTEGER, allowNull: true },
    id_zone_atual: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: "character_navigation_state" },
);

module.exports = CharacterNavigationState;
