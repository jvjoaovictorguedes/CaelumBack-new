const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Definição do Boss da Guilda por Rank (F..S, guildConfig.RANKS_GUILDA)
// — substitui GuildRankGate (antigo Portal de Guilda, spec §28/§54: "a
// infraestrutura técnica atual pode ser migrada... migrar nomes/
// semântica em vez de manter entidades chamadas RankGate"). Não promove
// mais Rank (isso passa a ser só pelas Missões de Rank, ver
// guildRankProgressionService) — a função do Boss agora é só XP de
// Guilda + recompensa individual + prestígio histórico (§29).
const GuildBossConfig = sequelize.define(
  "GuildBossConfig",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    rank: { type: DataTypes.STRING(10), allowNull: false, unique: true },
    nome_chefe: { type: DataTypes.STRING(100), allowNull: false },
    descricao: { type: DataTypes.TEXT, allowNull: false },
    vida_total: { type: DataTypes.BIGINT, allowNull: false },
    defesa: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    janela_horas: { type: DataTypes.INTEGER, allowNull: false },
    // §30 — custo pago pelo Tesouro pra liberar o boss da semana.
    custo_liberacao: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // §37 — XP de Guilda fixo concedido ao derrotar (não depende de dano).
    xp_guilda_concedido: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // §34/§35/§38 — pool de recompensa PESSOAL (Gold/XP de personagem)
    // distribuído 25% igual + 75% por dano entre os participantes, só se
    // o boss for derrotado. Mantido menor que custo_liberacao pra ser
    // sink econômico líquido.
    pool_dinheiro_total: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    pool_xp_total: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // V2.0 (batalha ao vivo) — dano que o boss causa por acerto na
    // primeira rodada; escala pra cima a cada rodada seguinte (ver
    // FATOR_ESCALADA_DANO_BOSS_AO_VIVO em guildConfig.js).
    dano_base_ataque: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // V2.0 — bônus de ouro só pra quem causou mais dano na tentativa
    // vencida, além da recompensa proporcional que todo mundo já recebe.
    premio_maior_dano: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    imagem_url: { type: DataTypes.STRING(255), allowNull: true },
  },
  {
    tableName: "guild_boss_configs",
  },
);

module.exports = GuildBossConfig;
