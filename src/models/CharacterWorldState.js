const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// A navegação marítima continua em CharacterNavigationState. Esta posição
// pertence ao mundo terrestre e não muda a localização/atividade do legado.
module.exports = sequelize.define("CharacterWorldState", {
  id_personagem: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
  mundo_habilitado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  mapa_slug: { type: DataTypes.STRING(100), allowNull: false, defaultValue: "capital" },
  tile_x: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 200 },
  tile_y: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 90 },
  versao_posicao: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, { tableName: "character_world_state" });
