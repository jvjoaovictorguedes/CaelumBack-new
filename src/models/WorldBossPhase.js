const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Fases do boss (§11) — fase ativa quando hp_current/hp_max*100 <=
// hp_percentual_max; faixas não se sobrepõem (validado no service).
const WorldBossPhase = sequelize.define(
  "WorldBossPhase",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_world_boss_config: { type: DataTypes.INTEGER, allowNull: false },
    ordem: { type: DataTypes.INTEGER, allowNull: false },
    nome_fase: { type: DataTypes.STRING(100), allowNull: false },
    hp_percentual_max: { type: DataTypes.INTEGER, allowNull: false },
    modificador_dano_percentual: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    texto_alerta: { type: DataTypes.TEXT, allowNull: true },
    // Ameaça Mundial V2 §5.1 — modelo híbrido: faixa base de dano por
    // fase + Fúria crescente dentro dela (fatorFuria calculado em
    // fishingEngine-equivalente da Etapa 3, não aqui).
    dano_min: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
    dano_max: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
    furia_por_acao_pct: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 0 },
    // NULL = sem limite (soft-enrage final, §5.4).
    limite_furia_pct: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
    // NULL = usa WorldBossConfig.intervalo_acao_ms (override opcional).
    intervalo_acao_ms: { type: DataTypes.INTEGER, allowNull: true },
    mana_ao_entrar: { type: DataTypes.INTEGER, allowNull: true },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "world_boss_phases" },
);

module.exports = WorldBossPhase;
