const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Catálogo de Missões da Guilda (spec "Aprimoramento do Sistema de
// Guildas" §5/§8/§52) — de onde o sorteio de cada ciclo escolhe UMA
// missão ativa por categoria (ver GuildMissionCycle). Diferente da
// Guilda dos Aventureiros (contratos individuais, aceitos um a um):
// aqui a missão é a MESMA pra todos os membros da guilda o ciclo
// inteiro, sem etapa de aceitar (§7).
//
// tipo_objetivo cobre só os eventos reais já emitidos pelo backend
// (§56: Aventura/Expedição/Forja/PvP) — não reusa os tipos de alvo
// específico (MatarMonstroEspecifico/MatarNaRegiao/Entregar/
// AlcancarNivel) da Guilda dos Aventureiros, que não fazem sentido pra
// uma missão coletiva sem dono.
const GuildMission = sequelize.define(
  "GuildMission",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    categoria: { type: DataTypes.ENUM("Diaria", "Semanal", "Mensal", "Rank"), allowNull: false },
    // Só preenchido quando categoria = "Rank" — qual Rank da GUILDA esta
    // missão pertence (F..S, ver guildConfig.RANKS_GUILDA).
    rank: { type: DataTypes.STRING(10), allowNull: true },
    nome: { type: DataTypes.STRING(150), allowNull: false },
    descricao: { type: DataTypes.TEXT, allowNull: false },
    tipo_objetivo: {
      type: DataTypes.ENUM(
        "MatarInimigos",
        "GanharOuro",
        "CompletarExpedicoes",
        "Fabricar",
        "Refinar",
        "VencerDuelos",
      ),
      allowNull: false,
    },
    meta: { type: DataTypes.INTEGER, allowNull: false },
    xp_guilda: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    pontos_contribuicao: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    ativa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    tableName: "guild_missions",
  },
);

module.exports = GuildMission;
