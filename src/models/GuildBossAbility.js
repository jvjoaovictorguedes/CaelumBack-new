const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Boss da Guilda — vínculo Boss -> Power reutilizado + config de
// IA/alvo/telegraph específica desta luta (mesmo padrão de
// WorldBossAbility). NUNCA duplicar dano/cura/custo/cooldown aqui —
// esses valores continuam em Power via id_power; esta tabela só decide
// COMO e QUANDO o chefe usa aquele Power. Sem fases_permitidas/
// escala_com_furia/custo_mana_override (Boss da Guilda não tem fases
// nem mana) e sem N_ALEATORIOS (grupo pequeno — 1 a 8 — TODOS já cobre
// o caso de AoE).
const GuildBossAbility = sequelize.define(
  "GuildBossAbility",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_guild_boss_config: { type: DataTypes.INTEGER, allowNull: false },
    id_power: { type: DataTypes.INTEGER, allowNull: false },
    peso_uso: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, validate: { min: 0 } },
    prioridade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    tipo_alvo: {
      type: DataTypes.ENUM("ALEATORIO", "MENOR_VIDA", "TODOS"),
      allowNull: false,
      defaultValue: "ALEATORIO",
    },
    tempo_conjuracao_ms: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
    // NULL = usa Power.cooldown, na mesma unidade "rodada" que o turno
    // do chefe já usa (guildBossSocket.batalha.rodada).
    cooldown_rodadas_override: { type: DataTypes.INTEGER, allowNull: true },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "guild_boss_abilities" },
);

module.exports = GuildBossAbility;
