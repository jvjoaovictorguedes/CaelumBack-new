// Macro-região geográfica do Mapa Mundial (spec "Mapa de Caelum v1" §13)
// — contém vários WorldMapNode, mas não é ela própria um ponto no mapa.
// Nesta versão nenhum território tem controle de Guilda: existem só
// como camada visual/estrutural pra uma feature territorial futura
// (§16/§47) — controle_habilitado começa sempre false e a API nunca
// retorna owner/guild enquanto essa feature não existir (§40/§50).
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const WorldTerritory = sequelize.define(
  "WorldTerritory",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    nome: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    // slug é só de apresentação/URL — nunca usado pra decidir regra de
    // negócio (spec §11: "nomes são de design, não lore final", banco/
    // frontend não devem depender de comparação hardcoded por texto).
    slug: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    descricao: { type: DataTypes.TEXT, allowNull: true },
    // [{ x: 0-100, y: 0-100 }, ...] em coordenadas PERCENTUAIS do mapa
    // (spec §14) — nunca pixels absolutos.
    polygon_points: { type: DataTypes.JSONB, allowNull: false },
    label_x: { type: DataTypes.FLOAT, allowNull: false },
    label_y: { type: DataTypes.FLOAT, allowNull: false },
    ordem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    controle_habilitado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { tableName: "world_territories" },
);

module.exports = WorldTerritory;
