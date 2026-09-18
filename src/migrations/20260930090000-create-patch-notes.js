"use strict";

// Patch notes — cada entrada é 1 mudança de UMA funcionalidade específica
// (não uma versão geral do jogo). "ordem" decide a posição na lista
// (maior = mais recente) porque semear tudo de uma vez com createdAt=now()
// deixaria tudo empatado — a ordem narrativa importa mais que a data real
// de quando a migração rodou.
//
// user_patch_notes_seen guarda só o MAIOR id de patch_notes que aquele
// usuário já viu (não um timestamp) — assim "quantidade não lida" é só
// `COUNT(*) WHERE id > ultimo_id_visto`, sem depender de relógio de
// cliente/servidor bater. ultimo_id_visto NULL = nunca visitou o painel
// (conta todas as notas como não lidas — inclusive pra quem já jogava
// antes desse sistema existir, o que é o comportamento certo: "veja
// tudo que mudou até agora").
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("patch_notes")) {
      await queryInterface.createTable("patch_notes", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        ordem: { type: Sequelize.INTEGER, allowNull: false },
        feature: { type: Sequelize.STRING(60), allowNull: false },
        versao: { type: Sequelize.STRING(20), allowNull: false },
        titulo: { type: Sequelize.STRING(150), allowNull: false },
        descricao: { type: Sequelize.TEXT, allowNull: false },
        publicado_em: { type: Sequelize.DATEONLY, allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addIndex("patch_notes", ["ordem"]);
    }

    if (!tabelas.includes("user_patch_notes_seen")) {
      await queryInterface.createTable("user_patch_notes_seen", {
        id_usuario: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          allowNull: false,
          references: { model: "users", key: "id" },
          onDelete: "CASCADE",
        },
        ultimo_id_visto: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "patch_notes", key: "id" },
          onDelete: "SET NULL",
        },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }
  },

  async down(queryInterface) {
    const tabelas = await queryInterface.showAllTables();
    if (tabelas.includes("user_patch_notes_seen")) {
      await queryInterface.dropTable("user_patch_notes_seen");
    }
    if (tabelas.includes("patch_notes")) {
      await queryInterface.dropTable("patch_notes");
    }
  },
};
