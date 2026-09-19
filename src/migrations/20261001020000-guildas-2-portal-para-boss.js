"use strict";

// Migra o antigo Portal de Guilda (guild_rank_gates/guild_gate_attempts/
// guild_gate_contributions) pro novo Boss da Guilda (spec
// "Aprimoramento do Sistema de Guildas" §28/§54/§55: "migrar nomes/
// semântica em vez de manter entidades chamadas RankGate"). Preserva
// os dados existentes (copia pras tabelas novas) antes de derrubar as
// antigas — o Boss não promove mais Rank (guild.rank passa a vir só
// das Missões de Rank, ver guildas-2-core-e-missoes), então as colunas
// de recompensa mudam de "flat por membro" pra "pool 25%/75%".
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("guild_boss_configs")) {
      await queryInterface.createTable("guild_boss_configs", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        rank: { type: Sequelize.STRING(10), allowNull: false, unique: true },
        nome_chefe: { type: Sequelize.STRING(100), allowNull: false },
        descricao: { type: Sequelize.TEXT, allowNull: false },
        vida_total: { type: Sequelize.BIGINT, allowNull: false },
        defesa: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        janela_horas: { type: Sequelize.INTEGER, allowNull: false },
        custo_liberacao: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        xp_guilda_concedido: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        pool_dinheiro_total: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        pool_xp_total: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        imagem_url: { type: Sequelize.STRING(255), allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
    }

    if (!tabelas.includes("guild_boss_attempts")) {
      await queryInterface.createTable("guild_boss_attempts", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_guild: { type: Sequelize.INTEGER, allowNull: false },
        id_guild_boss_config: { type: Sequelize.INTEGER, allowNull: false },
        rank: { type: Sequelize.STRING(10), allowNull: false },
        vida_total: { type: Sequelize.BIGINT, allowNull: false },
        vida_restante: { type: Sequelize.BIGINT, allowNull: false },
        semana_inicio: { type: Sequelize.DATE, allowNull: false },
        expira_em: { type: Sequelize.DATE, allowNull: false },
        status: { type: Sequelize.ENUM("Ativo", "Vencido", "Expirado"), allowNull: false, defaultValue: "Ativo" },
        recompensa_distribuida: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex("guild_boss_attempts", ["id_guild", "semana_inicio"], { unique: true });
    }

    if (!tabelas.includes("guild_boss_contributions")) {
      await queryInterface.createTable("guild_boss_contributions", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_guild_boss_attempt: { type: Sequelize.INTEGER, allowNull: false },
        id_personagem: { type: Sequelize.INTEGER, allowNull: false },
        dano_total: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        ultimo_ataque: { type: Sequelize.DATE, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex("guild_boss_contributions", ["id_guild_boss_attempt", "id_personagem"], {
        unique: true,
        name: "guild_boss_contributions_tentativa_personagem_unique",
      });
    }

    // Copia o catálogo antigo (guild_rank_gates) pro novo, mapeando os
    // campos de recompensa flat pros novos campos de pool — valores de
    // referência inicial (recompensa_dinheiro_por_membro vira uma base
    // pro pool, sujeito a recalibração no seeder). custo_liberacao
    // começa em 0 pra ranks já migrados (sem custo até o seeder
    // preencher de verdade) — nunca vamos cobrar um valor inventado
    // silenciosamente.
    if (tabelas.includes("guild_rank_gates")) {
      await queryInterface.sequelize.query(`
        INSERT INTO guild_boss_configs
          (rank, nome_chefe, descricao, vida_total, defesa, janela_horas,
           custo_liberacao, xp_guilda_concedido, pool_dinheiro_total, pool_xp_total,
           imagem_url, "createdAt", "updatedAt")
        SELECT
          rank, nome_chefe, descricao, vida_total, defesa, janela_horas,
          0, 0, COALESCE(recompensa_dinheiro_por_membro, 0) * 10, 0,
          imagem_url, now(), now()
        FROM guild_rank_gates
        ON CONFLICT (rank) DO NOTHING;
      `);

      await queryInterface.sequelize.query(`
        INSERT INTO guild_boss_attempts
          (id_guild, id_guild_boss_config, rank, vida_total, vida_restante,
           semana_inicio, expira_em, status, recompensa_distribuida, "createdAt", "updatedAt")
        SELECT
          a.id_guild, c.id, a.rank, a.vida_total, a.vida_restante,
          date_trunc('week', a.expira_em), a.expira_em,
          a.status::text::enum_guild_boss_attempts_status, (a.status = 'Vencido'), now(), now()
        FROM guild_gate_attempts a
        JOIN guild_boss_configs c ON c.rank = a.rank
        ON CONFLICT (id_guild, semana_inicio) DO NOTHING;
      `);

      await queryInterface.sequelize.query(`
        INSERT INTO guild_boss_contributions
          (id_guild_boss_attempt, id_personagem, dano_total, ultimo_ataque, "createdAt", "updatedAt")
        SELECT
          n.id, gc.id_personagem, gc.dano_total, gc.ultimo_ataque, now(), now()
        FROM guild_gate_contributions gc
        JOIN guild_gate_attempts a ON a.id = gc.id_guild_gate_attempt
        JOIN guild_boss_attempts n ON n.id_guild = a.id_guild AND n.semana_inicio = date_trunc('week', a.expira_em)
        ON CONFLICT DO NOTHING;
      `);

      await queryInterface.dropTable("guild_gate_contributions");
      await queryInterface.dropTable("guild_gate_attempts");
      await queryInterface.dropTable("guild_rank_gates");
    }
  },

  async down() {
    // Assimétrica de propósito — assim como a remoção do Portal
    // individual (mesma decisão já registrada nesta base): não vale o
    // risco de recriar as 3 tabelas antigas só pra reverter uma
    // migration que já preservou os dados na estrutura nova.
  },
};
