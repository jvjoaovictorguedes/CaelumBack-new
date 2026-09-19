const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Progresso INDIVIDUAL de um membro numa missão-do-ciclo da guilda
// (spec §6/§52): único por (ciclo-de-missão, personagem) — é essa
// unique index que impede um membro gerar XP/contribuição duas vezes
// pela mesma missão/ciclo (§57, idempotência).
const GuildMemberMissionProgress = sequelize.define(
  "GuildMemberMissionProgress",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_guild_mission_cycle: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "guild_mission_cycles", key: "id" },
    },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Characters", key: "id" } },
    progresso: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    concluida: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Separado de `concluida` de propósito: concluir soma +1 no
    // progresso de Rank da guilda (quando a categoria é Rank) e no
    // histórico, MAS a concessão de XP/contribuição por membro só pode
    // acontecer uma vez — este flag é o que garante isso mesmo que
    // `registrarProgresso` seja chamado de novo depois de já concluída.
    xp_concedida: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    tableName: "guild_member_mission_progress",
    // Nome CURTO explícito de propósito — o default gerado a partir dos
    // nomes de coluna passa de 63 bytes (limite do Postgres) e trunca
    // silenciosamente, causando um "already exists" no sync() de boot
    // (ver migration guildas-2-fix-index-name). Nunca remover este nome.
    indexes: [
      { unique: true, fields: ["id_guild_mission_cycle", "id_personagem"], name: "guild_member_mission_progress_unique" },
    ],
  },
);

module.exports = GuildMemberMissionProgress;
