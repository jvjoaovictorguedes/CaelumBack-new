"use strict";

// Torneios (PvP v2 §16) — feature nova, nenhuma tabela anterior.
// Nada aqui toca rating/limite diário do ranqueado nem PvpStatus do
// casual: torneio é uma terceira experiência isolada.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("tournaments")) {
      await queryInterface.createTable("tournaments", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        name: { type: Sequelize.STRING(120), allowNull: false },
        description: { type: Sequelize.TEXT, allowNull: true },
        level_min: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        level_max: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 999 },
        starts_at: { type: Sequelize.DATE, allowNull: false },
        max_participants: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 8 },
        prize_description: { type: Sequelize.TEXT, allowNull: true },
        status: {
          type: Sequelize.ENUM(
            "Rascunho",
            "InscricoesAbertas",
            "InscricoesFechadas",
            "EmAndamento",
            "Finalizado",
            "Cancelado",
          ),
          allowNull: false,
          defaultValue: "Rascunho",
        },
        // Marcador informativo ligado por admin — o sistema nunca credita
        // prêmio sozinho.
        prize_delivered: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        created_by: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "users", key: "id" },
        },
        // Chaveamento sorteado uma única vez, persistido pra sobreviver a
        // restart e nunca ser regerado.
        bracket_seed: { type: Sequelize.JSONB, allowNull: true },
        bracket_gerado_em: { type: Sequelize.DATE, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addIndex("tournaments", ["status"]);
    } else {
      console.log('[migration] "tournaments" já existe — pulando criação.');
    }

    if (!tabelas.includes("tournament_participants")) {
      await queryInterface.createTable("tournament_participants", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        tournament_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "tournaments", key: "id" },
          onDelete: "CASCADE",
        },
        character_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        seed: { type: Sequelize.INTEGER, allowNull: true },
        eliminated: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        final_placement: { type: Sequelize.INTEGER, allowNull: true },
        loadout_travado: { type: Sequelize.JSONB, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      // Um personagem só se inscreve uma vez por torneio — garantido no
      // banco, não só na checagem do controller.
      await queryInterface.addIndex("tournament_participants", ["tournament_id", "character_id"], {
        unique: true,
        name: "tournament_participants_tournament_character_unique",
      });
      await queryInterface.addIndex("tournament_participants", ["character_id"]);
    } else {
      console.log('[migration] "tournament_participants" já existe — pulando criação.');
    }

    if (!tabelas.includes("tournament_series")) {
      await queryInterface.createTable("tournament_series", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        tournament_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "tournaments", key: "id" },
          onDelete: "CASCADE",
        },
        round: {
          type: Sequelize.ENUM("Quartas", "Semifinal", "TerceiroLugar", "Final"),
          allowNull: false,
        },
        posicao: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        participant_a_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "tournament_participants", key: "id" },
        },
        participant_b_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "tournament_participants", key: "id" },
        },
        format: { type: Sequelize.ENUM("MD3", "MD5"), allowNull: false, defaultValue: "MD3" },
        score_a: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        score_b: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        winner_participant_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "tournament_participants", key: "id" },
        },
        status: {
          type: Sequelize.ENUM(
            "Aguardando",
            "ReadyCheck",
            "EmAndamento",
            "Finalizada",
            "WO",
            "PendenteAdm",
          ),
          allowNull: false,
          defaultValue: "Aguardando",
        },
        ready_check_expira_em: { type: Sequelize.DATE, allowNull: true },
        ready_a: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        ready_b: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addIndex("tournament_series", ["tournament_id", "round", "posicao"], {
        unique: true,
        name: "tournament_series_tournament_round_posicao_unique",
      });
    } else {
      console.log('[migration] "tournament_series" já existe — pulando criação.');
    }

    if (!tabelas.includes("tournament_matches")) {
      await queryInterface.createTable("tournament_matches", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        series_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "tournament_series", key: "id" },
          onDelete: "CASCADE",
        },
        game_number: { type: Sequelize.INTEGER, allowNull: false },
        // Sessão de duelo ao vivo (pvpLiveSocket) que resolveu este jogo.
        duel_id: { type: Sequelize.INTEGER, allowNull: true },
        winner_participant_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "tournament_participants", key: "id" },
        },
        motivo_encerramento: {
          type: Sequelize.ENUM("Combate", "Desistencia", "WO", "FalhaServidor"),
          allowNull: true,
        },
        iniciado_em: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        encerrado_em: { type: Sequelize.DATE, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addIndex("tournament_matches", ["series_id", "game_number"], {
        unique: true,
        name: "tournament_matches_series_game_unique",
      });
    } else {
      console.log('[migration] "tournament_matches" já existe — pulando criação.');
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("tournament_matches").catch(() => {});
    await queryInterface.dropTable("tournament_series").catch(() => {});
    await queryInterface.dropTable("tournament_participants").catch(() => {});
    await queryInterface.dropTable("tournaments").catch(() => {});
    for (const tipo of [
      "enum_tournament_matches_motivo_encerramento",
      "enum_tournament_series_round",
      "enum_tournament_series_format",
      "enum_tournament_series_status",
      "enum_tournaments_status",
    ]) {
      await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${tipo}";`).catch(() => {});
    }
  },
};
