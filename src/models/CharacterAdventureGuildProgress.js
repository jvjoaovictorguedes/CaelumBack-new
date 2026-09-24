const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Rank de Aventureiro (§9/§25 da spec) — 1:1 com Character, mesmo
// padrão de PvpStatus/CharacterForgeProgress. Deliberadamente SEM
// prefixo "guild"/"GuildRank" no nome da tabela/model — ver comentário
// em adventureGuildConfig.js sobre a colisão com GuildRankGate (Portal
// de Ranque coletivo da guilda de verdade).
const CharacterAdventureGuildProgress = sequelize.define(
  "CharacterAdventureGuildProgress",
  {
    id_personagem: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    rank: { type: DataTypes.STRING(10), allowNull: false, defaultValue: "F" },
    // Contratos de Rank efetivamente concluídos E resgatados no rank
    // ATUAL (§25) — nunca zera ao tentar/falhar Provação, só ao promover
    // (nesse momento volta a 0 pro próximo rank).
    missoes_concluidas_no_rank: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // §28/§29 — true assim que o requisito é atingido; a partir daqui
    // não se geram/aceitam mais ofertas normais do rank atual pra esse
    // personagem, só a Provação.
    apto_para_promocao: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // §30 — cooldown depois de uma tentativa de Provação falhada.
    ultima_falha_provacao_em: { type: DataTypes.DATE, allowNull: true },
    // Balcão de Espólios §6 — pontos de Reputação das encomendas.
    // Progressão PERMANENTE e independente do Rank F..S acima: nunca
    // zera por promoção, falha de Provação ou troca de janela. Nível/
    // nome/multiplicador são sempre CALCULADOS a partir deste único
    // valor (spoilReputationService) — nunca persistir nivel_reputacao
    // como segunda fonte de verdade (spec §6.3).
    reputacao_encomendas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // Caçadas §11.1/§13.3 — total PERMANENTE de encomendas do Balcão
    // concluídas (nunca conta o bônus 5/5, só cada entrega individual).
    // Incrementado uma vez em spoilOrderService.entregarEncomenda.
    total_spoil_orders_completed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    tableName: "character_adventure_guild_progress",
  },
);

module.exports = CharacterAdventureGuildProgress;
