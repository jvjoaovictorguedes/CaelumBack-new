"use strict";

// Painel Administrativo Fase 13 (§24) — Patch Notes ganha workflow
// (Rascunho/Publicado/Agendado), resumo curto, imagem e destaque, pra
// dar pra publicar pelo painel sem precisar de migration nova a cada
// atualização. `descricao` continua sendo o conteúdo completo (todas as
// dezenas de migrations antigas já inserem nela) — `resumo` é novo e
// opcional. `status` default 'Publicado' pra toda nota já existente
// continuar aparecendo pros jogadores exatamente como hoje.
module.exports = {
  async up(queryInterface, Sequelize) {
    const colunas = await queryInterface.describeTable("patch_notes");

    if (!colunas.resumo) {
      await queryInterface.addColumn("patch_notes", "resumo", {
        type: Sequelize.STRING(280),
        allowNull: true,
      });
    }
    if (!colunas.imagem_url) {
      await queryInterface.addColumn("patch_notes", "imagem_url", {
        type: Sequelize.STRING(500),
        allowNull: true,
      });
    }
    if (!colunas.destaque) {
      await queryInterface.addColumn("patch_notes", "destaque", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
    if (!colunas.status) {
      await queryInterface.addColumn("patch_notes", "status", {
        type: Sequelize.ENUM("Rascunho", "Publicado", "Agendado"),
        allowNull: false,
        defaultValue: "Publicado",
      });
    }
    if (!colunas.created_by_admin_id) {
      await queryInterface.addColumn("patch_notes", "created_by_admin_id", {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("patch_notes", "created_by_admin_id");
    await queryInterface.removeColumn("patch_notes", "status");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_patch_notes_status";');
    await queryInterface.removeColumn("patch_notes", "destaque");
    await queryInterface.removeColumn("patch_notes", "imagem_url");
    await queryInterface.removeColumn("patch_notes", "resumo");
  },
};
