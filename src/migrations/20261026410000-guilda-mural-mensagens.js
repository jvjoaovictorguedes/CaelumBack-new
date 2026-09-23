"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Nova permissão configurável (guildPermissionService.js): quem pode
    // postar/remover mensagem do Mural — padrão Fundador + Oficial.
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_GuildRolePermissions_permissao" ADD VALUE IF NOT EXISTS 'gerenciar_mural';`,
    );

    const tabelas = await queryInterface.showAllTables();
    if (tabelas.includes("GuildMuralMessages")) return;

    await queryInterface.createTable("GuildMuralMessages", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_guild: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Guilds", key: "id" },
        onDelete: "CASCADE",
      },
      id_personagem_autor: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Characters", key: "id" },
        onDelete: "CASCADE",
      },
      nome_personagem_autor: { type: Sequelize.STRING(100), allowNull: false },
      texto: { type: Sequelize.STRING(1000), allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex("GuildMuralMessages", ["id_guild", "createdAt"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("GuildMuralMessages");
    // Nota: mesmo motivo dos comentários em migrations anteriores de
    // permissão (ex.: 20261001010000) — Postgres não deixa remover valor
    // de ENUM sem recriar o tipo inteiro, então "gerenciar_mural" fica no
    // ENUM do banco mesmo depois do down(). Sem efeito prático: nada lê/
    // escreve esse valor sem a tabela acima.
  },
};
