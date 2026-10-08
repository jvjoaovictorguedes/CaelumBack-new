"use strict";

// Contribuição V2 (spec §15) — ledger imutável de eventos de pontuação,
// permitindo agregação por período (semana/mês/histórico) e composição
// por fonte sem criar dezenas de colunas semanais/mensais em
// GuildContribution. guildContributionService.pontuarContribuicao passa
// a criar uma linha aqui, na MESMA transaction da ação original, além
// de continuar atualizando GuildContribution.contribuicao_total (que
// permanece válido como legado histórico — §22.4 da spec).
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();
    if (tabelas.includes("GuildContributionEvents")) return;

    await queryInterface.createTable("GuildContributionEvents", {
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
      source_type: {
        type: Sequelize.ENUM(
          "MISSION_DAILY",
          "MISSION_WEEKLY",
          "MISSION_MONTHLY",
          "MISSION_RANK",
          "GUILD_BOSS",
          "GOLD_DONATION",
        ),
        allowNull: false,
      },
      source_id: { type: Sequelize.INTEGER, allowNull: true },
      pontos: { type: Sequelize.INTEGER, allowNull: false },
      metadata: { type: Sequelize.JSONB, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
    });

    // Ranking por período (SUM(pontos) WHERE id_guild = ? AND createdAt
    // >= inicioDoCiclo) é a consulta mais comum — índice composto cobre
    // tanto o ranking geral da guilda quanto o detalhe de 1 membro.
    await queryInterface.addIndex("GuildContributionEvents", ["id_guild", "createdAt"]);
    await queryInterface.addIndex("GuildContributionEvents", ["id_guild", "id_personagem", "createdAt"]);
    await queryInterface.addConstraint("GuildContributionEvents", {
      fields: ["pontos"],
      type: "check",
      name: "guild_contribution_events_pontos_positivo",
      where: { pontos: { [Sequelize.Op.gt]: 0 } },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("GuildContributionEvents");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_GuildContributionEvents_source_type";');
  },
};
