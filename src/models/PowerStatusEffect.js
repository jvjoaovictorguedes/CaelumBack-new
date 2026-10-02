const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Power = require("./Power");

// Efeito(s) de status de uma habilidade (§30 da Especificação Consolidada
// Poder/Status/Cooldown/Balanceamento) — tabela filha porque
// Power.efeito_status (campo único, legado) não suporta uma habilidade
// com dois efeitos diferentes. Uma linha por efeito; uma Power pode ter
// zero, uma ou várias linhas.
const PowerStatusEffect = sequelize.define(
  "PowerStatusEffect",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_power: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Power, key: "id" },
    },
    status_key: { type: DataTypes.STRING(20), allowNull: false },
    // Partes por milhão (§31) — 1.000.000 = 100%, padrão do projeto pra
    // chance em vez de FLOAT.
    chance_ppm: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1_000_000 },
    duration_turns: { type: DataTypes.INTEGER, allowNull: false },
    potency_base: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    // Atributo do CASTER que escala a potência (ex.: Inteligência numa
    // Queimadura mágica) — null = potência fixa, sem escala.
    potency_scale_attribute: {
      type: DataTypes.ENUM("Forca", "Vitalidade", "Agilidade", "Inteligencia", "Velocidade"),
      allowNull: true,
    },
    potency_scale_value: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    // Habilidades V2.0 §4/§21 — magnitude V2 (% da Vida máxima do
    // portador por tick/stack), nullable de propósito: null = ainda no
    // modo legado (potency_base como dano absoluto, ver
    // statusEffectService.calcularDanoDoTick). As duas colunas
    // coexistem até o Admin migrar cada linha explicitamente.
    percentual_vida_maxima: { type: DataTypes.FLOAT, allowNull: true },
    target: {
      type: DataTypes.ENUM("Self", "Enemy"),
      allowNull: false,
      defaultValue: "Enemy",
    },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "power_status_effects" },
);

module.exports = PowerStatusEffect;
