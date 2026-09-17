"use strict";

// Portal de Guilda — chefe com pool de vida gigante (BIGINT) e janela
// de tempo, derrubado coletivamente pelos ataques dos membros
// (GuildGateContribution). Vencer promove Guilds.rank pro próximo da
// escada (mesma de Character.rank — ver rankService.js).
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    const descricaoGuilds = await queryInterface.describeTable("Guilds");
    if (!("rank" in descricaoGuilds)) {
      await queryInterface.addColumn("Guilds", "rank", {
        type: Sequelize.STRING(10),
        allowNull: false,
        defaultValue: "F",
      });
    }

    if (!tabelas.includes("guild_rank_gates")) {
      await queryInterface.createTable("guild_rank_gates", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        rank: { type: Sequelize.STRING(10), allowNull: false, unique: true },
        nome_chefe: { type: Sequelize.STRING(100), allowNull: false },
        descricao: { type: Sequelize.TEXT, allowNull: false },
        vida_total: { type: Sequelize.BIGINT, allowNull: false },
        defesa: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        janela_horas: { type: Sequelize.INTEGER, allowNull: false },
        recompensa_tesouro: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        recompensa_dinheiro_por_membro: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        imagem_url: { type: Sequelize.STRING(255), allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    if (!tabelas.includes("guild_gate_attempts")) {
      await queryInterface.createTable("guild_gate_attempts", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        id_guild: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Guilds", key: "id" },
          onDelete: "CASCADE",
        },
        id_guild_rank_gate: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "guild_rank_gates", key: "id" },
        },
        rank: { type: Sequelize.STRING(10), allowNull: false },
        vida_total: { type: Sequelize.BIGINT, allowNull: false },
        vida_restante: { type: Sequelize.BIGINT, allowNull: false },
        expira_em: { type: Sequelize.DATE, allowNull: false },
        status: { type: Sequelize.ENUM("Ativo", "Vencido", "Expirado"), allowNull: false, defaultValue: "Ativo" },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });

      // Só uma tentativa "Ativo" por guilda de cada vez — índice parcial
      // em vez de checar isso só na aplicação, pra sobreviver mesmo a
      // uma corrida de duas requisições de "iniciar portal" quase juntas.
      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX guild_gate_attempts_uma_ativa_por_guilda
        ON guild_gate_attempts (id_guild)
        WHERE status = 'Ativo';
      `);
    }

    if (!tabelas.includes("guild_gate_contributions")) {
      await queryInterface.createTable("guild_gate_contributions", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        id_guild_gate_attempt: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "guild_gate_attempts", key: "id" },
          onDelete: "CASCADE",
        },
        id_personagem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        dano_total: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        ultimo_ataque: { type: Sequelize.DATE, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });

      await queryInterface.addConstraint("guild_gate_contributions", {
        fields: ["id_guild_gate_attempt", "id_personagem"],
        type: "unique",
        name: "guild_gate_contributions_tentativa_personagem_unique",
      });
    }
  },

  async down(queryInterface) {
    const tabelas = await queryInterface.showAllTables();
    if (tabelas.includes("guild_gate_contributions")) {
      await queryInterface.dropTable("guild_gate_contributions");
    }
    if (tabelas.includes("guild_gate_attempts")) {
      await queryInterface.dropTable("guild_gate_attempts");
    }
    if (tabelas.includes("guild_rank_gates")) {
      await queryInterface.dropTable("guild_rank_gates");
    }
    const descricaoGuilds = await queryInterface.describeTable("Guilds");
    if ("rank" in descricaoGuilds) {
      await queryInterface.removeColumn("Guilds", "rank");
    }
  },
};
