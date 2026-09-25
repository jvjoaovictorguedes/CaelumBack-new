const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Boss Global (Caelum_Boss_Global.docx) — catálogo de Ameaças Mundiais.
// Editar um config NUNCA afeta um evento em andamento (ver
// WorldBossEvent.config_snapshot, congelado no início do ciclo — §18/§19).
const WorldBossConfig = sequelize.define(
  "WorldBossConfig",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    nome: { type: DataTypes.STRING(150), allowNull: false },
    descricao: { type: DataTypes.TEXT, allowNull: false },
    lore: { type: DataTypes.TEXT, allowNull: true },
    imagem_url: { type: DataTypes.STRING, allowNull: true },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    peso_selecao: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    vida_base: { type: DataTypes.BIGINT, allowNull: false },
    defesa: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    mensagem_descoberta: { type: DataTypes.TEXT, allowNull: false },
    mensagem_convocacao: { type: DataTypes.TEXT, allowNull: false },
    mensagem_fase_final: { type: DataTypes.TEXT, allowNull: true },
    mensagem_derrota: { type: DataTypes.TEXT, allowNull: true },
    id_item_golpe_final: { type: DataTypes.INTEGER, allowNull: false },
    gold_descoberta: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    gold_participacao: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    xp_participacao: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    min_dano_participacao: { type: DataTypes.BIGINT, allowNull: true },
  },
  { tableName: "world_boss_configs" },
);

module.exports = WorldBossConfig;
