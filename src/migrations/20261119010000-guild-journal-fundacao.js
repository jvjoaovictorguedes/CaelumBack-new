"use strict";

// Jornal da Guilda dos Aventureiros — feed de novidades curado pelo
// Admin (nunca gerado automaticamente por gatilho de jogo), pra
// registrar conquistas notáveis de jogadores/guildas (primeiro Rank S,
// primeira guilda a bater nível 5, primeira reputação Caçador Mestre
// etc). Mesmo workflow Rascunho/Publicado/Agendado dos Patch Notes
// (ver 20261029010000-admin-panel-fundacao.js / patchNotesController),
// mas domínio separado — não é sobre mudanças no jogo, é sobre o que
// jogadores fizeram nele.
//
// personagem_nome/guilda_nome são texto livre, não FK: o admin digita
// o nome no momento da publicação. Uma FK pra Characters/Guilds
// quebraria a nota se o personagem fosse deletado ou a guilda
// dissolvida — a nota é um registro histórico, tem que sobreviver a
// isso.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("guild_journal_entries")) {
      await queryInterface.createTable("guild_journal_entries", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        ordem: { type: Sequelize.INTEGER, allowNull: false },
        categoria: {
          type: Sequelize.ENUM("ConquistaIndividual", "ConquistaDeGuilda", "Evento", "Outro"),
          allowNull: false,
          defaultValue: "Outro",
        },
        titulo: { type: Sequelize.STRING(150), allowNull: false },
        descricao: { type: Sequelize.TEXT, allowNull: false },
        resumo: { type: Sequelize.STRING(280), allowNull: true },
        imagem_url: { type: Sequelize.STRING(500), allowNull: true },
        personagem_nome: { type: Sequelize.STRING(100), allowNull: true },
        guilda_nome: { type: Sequelize.STRING(100), allowNull: true },
        destaque: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        status: {
          type: Sequelize.ENUM("Rascunho", "Publicado", "Agendado"),
          allowNull: false,
          defaultValue: "Publicado",
        },
        created_by_admin_id: { type: Sequelize.INTEGER, allowNull: true },
        publicado_em: { type: Sequelize.DATEONLY, allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'guildjournal.manage' LIMIT 1;`,
    );
    if (existente.length === 0) {
      await queryInterface.sequelize.query(
        `INSERT INTO admin_permissions (chave, descricao, "createdAt", "updatedAt")
         VALUES ('guildjournal.manage', 'Publicar/editar notas do Jornal da Guilda dos Aventureiros', now(), now());`,
      );
    }
    const [[permissao]] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'guildjournal.manage' LIMIT 1;`,
    );
    for (const nomeRole of ["Conteudo", "SuperAdmin"]) {
      const [[role]] = await queryInterface.sequelize.query(
        `SELECT id FROM admin_roles WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: nomeRole } },
      );
      if (!role || !permissao) continue;
      await queryInterface.sequelize.query(
        `INSERT INTO admin_role_permissions (id_role, id_permission, "createdAt", "updatedAt")
         VALUES (:idRole, :idPermission, now(), now())
         ON CONFLICT DO NOTHING;`,
        { replacements: { idRole: role.id, idPermission: permissao.id } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM admin_role_permissions WHERE id_permission = (SELECT id FROM admin_permissions WHERE chave = 'guildjournal.manage');`,
    );
    await queryInterface.sequelize.query(`DELETE FROM admin_permissions WHERE chave = 'guildjournal.manage';`);

    await queryInterface.dropTable("guild_journal_entries");
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_guild_journal_entries_status";`);
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_guild_journal_entries_categoria";`);
  },
};
