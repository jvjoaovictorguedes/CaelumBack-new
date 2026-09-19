const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Catálogo de contratos de Rank da Guilda dos Aventureiros (§13/§14/
// §23/§34 da spec) — o pool de onde a rotação sorteia as 5 ofertas.
// Objetivo estruturado por ID (nunca comparação de texto, §23):
// id_monstro_alvo/id_area_alvo apontam pro catálogo já existente do
// Modo Aventura (AdventureMonster/AdventureZone), id_item_alvo pro
// catálogo de Item — sempre nullable porque cada tipo_objetivo usa só
// o subconjunto de campos que faz sentido pra ele.
const AdventureGuildMission = sequelize.define(
  "AdventureGuildMission",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    // F..S — qual Rank esta missão pertence (§12: só aceita contrato do
    // próprio Rank atual).
    rank: { type: DataTypes.STRING(10), allowNull: false },
    nome: { type: DataTypes.STRING(150), allowNull: false },
    descricao: { type: DataTypes.TEXT, allowNull: false },
    tipo_objetivo: {
      type: DataTypes.ENUM(
        "MatarInimigos",
        "MatarMonstroEspecifico",
        "MatarNaRegiao",
        "VencerDuelos",
        "GanharOuro",
        "CompletarExpedicoes",
        "Fabricar",
        "Refinar",
        "Entregar",
        "AlcancarNivel",
      ),
      allowNull: false,
    },
    id_monstro_alvo: { type: DataTypes.INTEGER, allowNull: true },
    id_area_alvo: { type: DataTypes.INTEGER, allowNull: true },
    id_item_alvo: { type: DataTypes.INTEGER, allowNull: true },
    // Meta genérica: quantidade de abates/expedições/fabricações/ouro/
    // itens a entregar, conforme tipo_objetivo.
    quantidade_objetivo: { type: DataTypes.INTEGER, allowNull: false },
    // Filtro opcional pra Fabricar/Entregar/Refinar de uma raridade
    // mínima (mesmos valores de Item.raridade) — null = qualquer uma.
    qualidade_minima: { type: DataTypes.STRING(20), allowNull: true },
    // §28-§31 — Provação: missão especial de promoção, NUNCA entra no
    // sorteio das 5 ofertas normais (ver adventureGuildRotationService),
    // só é alcançável via POST /trial/start quando apto_para_promocao.
    eh_provacao: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    ativa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    tableName: "adventure_guild_missions",
  },
);

module.exports = AdventureGuildMission;
