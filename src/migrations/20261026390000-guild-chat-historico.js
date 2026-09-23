"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();
    if (tabelas.includes("GuildChatMessages")) return;

    await queryInterface.createTable("GuildChatMessages", {
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
        onDelete: "CASCADE",
      },
      nome_personagem: { type: Sequelize.STRING(100), allowNull: false },
      texto: { type: Sequelize.STRING(500), allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
    });

    // Índice pela guilda + data — é exatamente o par usado tanto pra
    // buscar o histórico do mês (ORDER BY createdAt) quanto pra limpeza
    // mensal (DELETE ... WHERE id_guild = X AND createdAt < :inicioDoMes).
    await queryInterface.addIndex("GuildChatMessages", ["id_guild", "createdAt"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("GuildChatMessages");
  },
};
