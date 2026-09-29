const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Ameaça Mundial V2 §6.2 — vínculo Boss -> Power reutilizado + config de
// IA/alvo/cast específica de raid. NUNCA duplicar dano/cura/custo/
// cooldown/escala aqui: esses valores continuam em Power (via id_power);
// esta tabela só decide COMO e QUANDO o Boss usa aquele Power.
const WorldBossAbility = sequelize.define(
  "WorldBossAbility",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_world_boss_config: { type: DataTypes.INTEGER, allowNull: false },
    id_power: { type: DataTypes.INTEGER, allowNull: false },
    peso_uso: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, validate: { min: 0 } },
    prioridade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // Array de id de WorldBossPhase elegíveis; NULL/vazio = todas as
    // fases do catálogo (§6.2 fases_permitidas).
    fases_permitidas: { type: DataTypes.ARRAY(DataTypes.INTEGER), allowNull: true },
    tipo_alvo: {
      type: DataTypes.ENUM("ALEATORIO", "MAIOR_DANO", "MENOR_VIDA", "N_ALEATORIOS", "TODOS", "SELF"),
      allowNull: false,
      defaultValue: "ALEATORIO",
    },
    // Só relevante quando tipo_alvo = N_ALEATORIOS.
    quantidade_alvos: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 1 } },
    tempo_conjuracao_ms: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
    // NULL = usa Power.cooldown / custo efetivo do Power.
    cooldown_override: { type: DataTypes.INTEGER, allowNull: true },
    custo_mana_override: { type: DataTypes.INTEGER, allowNull: true },
    // §5.5 — Fúria multiplica habilidades ofensivas por padrão; curas/
    // buffs do Boss (tipo_alvo SELF) não devem escalar automaticamente.
    escala_com_furia: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "world_boss_abilities" },
);

module.exports = WorldBossAbility;
