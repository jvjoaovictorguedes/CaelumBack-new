"use strict";

// PvP v2 (§11/§12) — limite diário de partidas ranqueadas e as colunas
// que a partida ASSÍNCRONA precisa em ranked_matches: marcar que o
// defensor é um snapshot controlado por IA (rating dele nunca muda),
// guardar o dia contábil usado pelo limite/anti-rematch e um status que
// torna a finalização idempotente.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("character_ranked_daily_usage")) {
      await queryInterface.createTable("character_ranked_daily_usage", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        character_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        // "YYYY-MM-DD" já no fuso configurado (rankedConfig).
        date_key: { type: Sequelize.STRING(10), allowNull: false },
        matches_used: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      // UNIQUE é o que viabiliza o consumo atômico (INSERT ON CONFLICT +
      // UPDATE condicional) — sem ele, duas requisições concorrentes
      // conseguiriam criar duas linhas e gastar duas vezes a mesma vaga.
      await queryInterface.addIndex("character_ranked_daily_usage", ["character_id", "date_key"], {
        unique: true,
        name: "character_ranked_daily_usage_character_date_unique",
      });
    } else {
      console.log('[migration] "character_ranked_daily_usage" já existe — pulando criação.');
    }

    const colunas = await queryInterface.describeTable("ranked_matches");

    if (!colunas.defensor_controlado_por_ia) {
      await queryInterface.addColumn("ranked_matches", "defensor_controlado_por_ia", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    if (!colunas.date_key) {
      await queryInterface.addColumn("ranked_matches", "date_key", {
        type: Sequelize.STRING(10),
        allowNull: true,
      });
      await queryInterface.addIndex("ranked_matches", ["id_jogador1", "date_key"], {
        name: "ranked_matches_jogador1_date_idx",
      });
    }

    if (!colunas.status) {
      await queryInterface.addColumn("ranked_matches", "status", {
        type: Sequelize.ENUM("EmAndamento", "Finalizada"),
        allowNull: false,
        defaultValue: "EmAndamento",
      });
      // Partidas antigas (v1) já terminaram — marcar como finalizadas
      // evita que qualquer rotina futura tente "finalizá-las" de novo.
      await queryInterface.sequelize.query(
        `UPDATE ranked_matches SET status = 'Finalizada' WHERE encerrada_em IS NOT NULL;`,
      );
    }

    if (!colunas.delta_desafiante) {
      await queryInterface.addColumn("ranked_matches", "delta_desafiante", {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("ranked_matches", "ranked_matches_jogador1_date_idx").catch(() => {});
    await queryInterface.removeColumn("ranked_matches", "delta_desafiante").catch(() => {});
    await queryInterface.removeColumn("ranked_matches", "status").catch(() => {});
    await queryInterface
      .sequelize.query('DROP TYPE IF EXISTS "enum_ranked_matches_status";')
      .catch(() => {});
    await queryInterface.removeColumn("ranked_matches", "date_key").catch(() => {});
    await queryInterface.removeColumn("ranked_matches", "defensor_controlado_por_ia").catch(() => {});
    await queryInterface.dropTable("character_ranked_daily_usage").catch(() => {});
  },
};
