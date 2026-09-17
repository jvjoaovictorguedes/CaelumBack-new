"use strict";

// Núcleo do sistema de guildas (v1/MVP): identidade, membros, cargos/
// permissões, convites, candidaturas, logs, tesouro, contribuição e a
// tabela de progressão. Baú, Missões, Boss da Guilda, Construções e GvG
// ficam pra v2/v3 (ver documento de design) — o schema abaixo não tenta
// prever essas tabelas ainda.
module.exports = {
  async up(queryInterface, Sequelize) {
    const existingTables = await queryInterface.showAllTables();
    if (existingTables.includes("Guilds")) {
      console.log('[migration] Tabela "Guilds" já existe — pulando criação.');
      return;
    }

    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "Guilds",
        {
          id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
            allowNull: false,
          },
          nome: { type: Sequelize.STRING(24), allowNull: false, unique: true },
          sigla: { type: Sequelize.STRING(5), allowNull: false, unique: true },
          descricao: { type: Sequelize.STRING(500), allowNull: true },
          emblema_url: { type: Sequelize.STRING(255), allowNull: true },
          id_fundador: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: "Characters", key: "id" },
          },
          id_lider: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: "Characters", key: "id" },
          },
          nivel: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
          experiencia: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          prestigio: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          tesouro: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          limite_membros: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 25 },
          tipo_recrutamento: {
            type: Sequelize.ENUM("Aberto", "Aprovacao", "Convite"),
            allowNull: false,
            defaultValue: "Aprovacao",
          },
          status: {
            type: Sequelize.ENUM("Ativa", "Dissolucao", "Suspensa", "Encerrada"),
            allowNull: false,
            defaultValue: "Ativa",
          },
          mural: { type: Sequelize.STRING(1000), allowNull: true },
          meta_ativa: { type: Sequelize.STRING(255), allowNull: true },
          createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
          updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        },
        { transaction },
      );

      await queryInterface.addConstraint("Guilds", {
        fields: ["tesouro"],
        type: "check",
        name: "guilds_tesouro_nao_negativo",
        where: { tesouro: { [Sequelize.Op.gte]: 0 } },
        transaction,
      });

      await queryInterface.createTable(
        "GuildMembers",
        {
          // PK = id_personagem: garante "uma guilda por personagem" no
          // próprio banco, sem constraint separada.
          id_personagem: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true,
            references: { model: "Characters", key: "id" },
            onDelete: "CASCADE",
          },
          id_guild: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: "Guilds", key: "id" },
            onDelete: "CASCADE",
          },
          cargo: {
            type: Sequelize.ENUM("Fundador", "Oficial", "Veterano", "Membro", "Recruta"),
            allowNull: false,
            defaultValue: "Recruta",
          },
          data_entrada: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        },
        { transaction },
      );

      await queryInterface.createTable(
        "GuildRolePermissions",
        {
          id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
          id_guild: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: "Guilds", key: "id" },
            onDelete: "CASCADE",
          },
          cargo: {
            type: Sequelize.ENUM("Fundador", "Oficial", "Veterano", "Membro", "Recruta"),
            allowNull: false,
          },
          permissao: {
            type: Sequelize.ENUM(
              "convidar",
              "aceitar_candidatura",
              "expulsar",
              "promover_rebaixar",
              "editar_identidade",
              "editar_cargos",
              "autorizar_gastos",
            ),
            allowNull: false,
          },
          permitido: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        },
        { transaction },
      );
      await queryInterface.addConstraint("GuildRolePermissions", {
        fields: ["id_guild", "cargo", "permissao"],
        type: "unique",
        name: "guild_role_permissions_unica",
        transaction,
      });

      await queryInterface.createTable(
        "GuildInvites",
        {
          id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
          id_guild: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: "Guilds", key: "id" },
            onDelete: "CASCADE",
          },
          id_personagem_convidado: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: "Characters", key: "id" },
          },
          id_personagem_convidante: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: "Characters", key: "id" },
          },
          status: {
            type: Sequelize.ENUM("Pendente", "Aceito", "Recusado", "Cancelado", "Expirado"),
            allowNull: false,
            defaultValue: "Pendente",
          },
          data_expiracao: { type: Sequelize.DATE, allowNull: false },
          createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
          updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        },
        { transaction },
      );

      await queryInterface.createTable(
        "GuildApplications",
        {
          id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
          id_guild: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: "Guilds", key: "id" },
            onDelete: "CASCADE",
          },
          id_personagem: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: "Characters", key: "id" },
          },
          mensagem: { type: Sequelize.STRING(300), allowNull: true },
          status: {
            type: Sequelize.ENUM("Pendente", "Aceita", "Recusada", "Cancelada", "Expirada"),
            allowNull: false,
            defaultValue: "Pendente",
          },
          data_resposta: { type: Sequelize.DATE, allowNull: true },
          createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
          updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        },
        { transaction },
      );

      await queryInterface.createTable(
        "GuildLogs",
        {
          id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
          id_guild: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: "Guilds", key: "id" },
            onDelete: "CASCADE",
          },
          tipo: { type: Sequelize.STRING(50), allowNull: false },
          id_personagem_responsavel: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: "Characters", key: "id" },
          },
          id_personagem_alvo: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: "Characters", key: "id" },
          },
          detalhes: { type: Sequelize.STRING(500), allowNull: true },
          createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        },
        { transaction },
      );

      await queryInterface.createTable(
        "GuildTreasuryTransactions",
        {
          id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
          id_guild: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: "Guilds", key: "id" },
            onDelete: "CASCADE",
          },
          tipo: { type: Sequelize.ENUM("Doacao", "Gasto", "Estorno"), allowNull: false },
          id_personagem: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: "Characters", key: "id" },
          },
          valor: { type: Sequelize.INTEGER, allowNull: false },
          saldo_resultante: { type: Sequelize.INTEGER, allowNull: false },
          motivo: { type: Sequelize.STRING(255), allowNull: true },
          createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        },
        { transaction },
      );

      await queryInterface.createTable(
        "GuildContributions",
        {
          id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
          id_guild: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: "Guilds", key: "id" },
            onDelete: "CASCADE",
          },
          id_personagem: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: "Characters", key: "id" },
          },
          ouro_doado_total: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          contribuicao_total: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          contribuicao_temporada: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          xp_doacao_hoje: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
          data_ultimo_xp_doacao: { type: Sequelize.DATEONLY, allowNull: true },
          createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
          updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        },
        { transaction },
      );
      await queryInterface.addConstraint("GuildContributions", {
        fields: ["id_guild", "id_personagem"],
        type: "unique",
        name: "guild_contributions_unica",
        transaction,
      });

      await queryInterface.createTable(
        "GuildLevelConfig",
        {
          nivel: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true },
          xp_para_proximo_nivel: { type: Sequelize.INTEGER, allowNull: true },
          limite_membros: { type: Sequelize.INTEGER, allowNull: false },
        },
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const tabela of [
        "GuildContributions",
        "GuildTreasuryTransactions",
        "GuildLogs",
        "GuildApplications",
        "GuildInvites",
        "GuildRolePermissions",
        "GuildMembers",
        "GuildLevelConfig",
        "Guilds",
      ]) {
        await queryInterface.dropTable(tabela, { transaction });
      }
    });
    for (const enumName of [
      "enum_Guilds_tipo_recrutamento",
      "enum_Guilds_status",
      "enum_GuildMembers_cargo",
      "enum_GuildRolePermissions_cargo",
      "enum_GuildRolePermissions_permissao",
      "enum_GuildInvites_status",
      "enum_GuildApplications_status",
      "enum_GuildTreasuryTransactions_tipo",
    ]) {
      await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${enumName}";`);
    }
  },
};
