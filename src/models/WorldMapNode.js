// Ponto/local no Mapa Mundial (spec "Mapa de Caelum v1" §17) — nunca
// duplica nome/nível/recursos/monstros da entidade real: entity_id
// referencia a fonte de verdade (AdventureZone/ExpeditionRegion), que
// continua sendo consultada ao vivo por worldMapService.
//
// Simplificação documentada em relação à spec: ela lista `tipo` e
// `entity_type` como dois campos separados, mas nos exemplos dados
// (§19: "Adventure + entity_id -> AdventureZone", "Expedition +
// entity_id -> ExpeditionRegion") os dois sempre têm o mesmo valor —
// não existe nenhum caso onde `tipo` e `entity_type` divergem. Manter
// os dois campos seria uma coluna redundante sem nenhum uso real, então
// este model usa só `tipo` fazendo o papel dos dois ao mesmo tempo
// (Adventure/Expedition apontam pra uma entidade via entity_id; City/
// Service/Landmark não precisam de entidade nenhuma). O objetivo da
// spec (entity_id nunca duplicar dados da fonte de verdade) continua
// 100% preservado.
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const WorldMapNode = sequelize.define(
  "WorldMapNode",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    nome: { type: DataTypes.STRING(100), allowNull: false },
    // Extensível por migration (spec §18 pede considerar Dungeon/
    // WorldBoss/Event no futuro — não criados agora, spec §46).
    tipo: {
      type: DataTypes.ENUM("Adventure", "Expedition", "City", "Service", "Landmark"),
      allowNull: false,
    },
    // AdventureZone.id ou ExpeditionRegion.id conforme `tipo` — null
    // pra City/Service/Landmark (ver metadata pra Service).
    entity_id: { type: DataTypes.INTEGER, allowNull: true },
    // null = zona neutra (Capital e infraestrutura global — spec §9/§17).
    id_territorio: { type: DataTypes.INTEGER, allowNull: true },
    // Percentual 0-100 sobre a arte base do mapa (spec §26) — nunca pixel.
    x: { type: DataTypes.FLOAT, allowNull: false, validate: { min: 0, max: 100 } },
    y: { type: DataTypes.FLOAT, allowNull: false, validate: { min: 0, max: 100 } },
    icone_url: { type: DataTypes.STRING(255), allowNull: true },
    imagem_url: { type: DataTypes.STRING(255), allowNull: true },
    ordem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // City (Capital): { services: ["SHOP","MARKET",...] } — chaves
    // allowlisted resolvidas pra rota no worldMapService (spec §20),
    // nunca uma rota livre vinda do banco.
    metadata: { type: DataTypes.JSONB, allowNull: true },
  },
  { tableName: "world_map_nodes" },
);

module.exports = WorldMapNode;
