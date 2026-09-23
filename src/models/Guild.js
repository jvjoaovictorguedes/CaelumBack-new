const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Guild = sequelize.define(
  "Guild",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    nome: {
      type: DataTypes.STRING(24),
      allowNull: false,
      unique: true,
    },
    sigla: {
      type: DataTypes.STRING(5),
      allowNull: false,
      unique: true,
    },
    descricao: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    // Aponta pro endpoint próprio (GET /guilds/:id/emblem) depois de um
    // upload — nunca uma URL arbitrária vinda do cliente (ver
    // guildEmblemController.js). ?v=<timestamp> no fim pra cache-busting.
    emblema_url: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    // Bytes da imagem já validada/normalizada (ver guildEmblemService.js)
    // — guardada no próprio banco, não em disco local (o host não
    // garante disco persistente entre deploys).
    emblema_imagem: {
      type: DataTypes.BLOB,
      allowNull: true,
    },
    emblema_mime: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    emblema_atualizado_em: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    id_fundador: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Characters", key: "id" },
    },
    id_lider: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Characters", key: "id" },
    },
    nivel: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    experiencia: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    prestigio: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    tesouro: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    limite_membros: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 25,
    },
    tipo_recrutamento: {
      type: DataTypes.ENUM("Aberto", "Aprovacao", "Convite"),
      allowNull: false,
      defaultValue: "Aprovacao",
    },
    status: {
      type: DataTypes.ENUM("Ativa", "Dissolucao", "Suspensa", "Encerrada"),
      allowNull: false,
      defaultValue: "Ativa",
    },
    mural: {
      type: DataTypes.STRING(1000),
      allowNull: true,
    },
    // Escada PRÓPRIA da guilda F..S (guildConfig.RANKS_GUILDA) — NÃO é
    // mais a escada F...S++ de rankService.js/Character.rank. Sobe
    // exclusivamente por conclusões de Missões de Rank da guilda (ver
    // guildRankProgressionService) — o antigo Portal de Guilda (agora
    // Boss da Guilda, ver GuildBossConfig) não promove mais rank.
    rank: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: "F",
    },
    // Contador de conclusões de Missão de Rank no rank atual — zera a
    // cada promoção. Comparado contra guildConfig.REQUISITOS_RANK_GUILDA.
    missoes_rank_concluidas_no_rank_atual: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    // XP acumulado dentro do nível atual (usado por guildXpService pra
    // subir de nível, NUNCA diminui só quando "gasto" ao subir).
    // experiencia_total_ganha é o contador histórico separado, que
    // nunca diminui — usado só pra ranking/métricas (spec §42).
    experiencia_total_ganha: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
    },
    // Contador histórico permanente de Boss derrotado (spec §39) —
    // nunca reseta, incrementado exatamente uma vez por vitória.
    bosses_derrotados_total: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    meta_ativa: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    tableName: "Guilds",
    // emblema_imagem pode ter até algumas centenas de KB — excluída do
    // SELECT por padrão pra não pesar TODA query de Guild que não
    // precisa dela (listagem, ranking, qualquer lookup interno já
    // existente antes desse campo existir). Só guildEmblemController
    // (servir o próprio emblema) usa Guild.scope("comImagem") pra
    // pedir esse campo de volta explicitamente.
    defaultScope: {
      attributes: { exclude: ["emblema_imagem"] },
    },
    scopes: {
      comImagem: {},
    },
  },
);

module.exports = Guild;
