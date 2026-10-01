"use strict";

// Chat global — mesmo padrão do chat de guilda (GuildChatMessages):
// histórico persistido, limpo todo mês (ver globalChatService.js), sem
// id_guild porque é uma sala única pro servidor inteiro.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("GlobalChatMessages", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      id_personagem: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Characters", key: "id" },
      },
      nome_personagem: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      texto: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });
    await queryInterface.addIndex("GlobalChatMessages", ["createdAt"], {
      name: "global_chat_messages_created_at_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("GlobalChatMessages");
  },
};
