"use strict";

// Wiki do Jogo — artigos de referência pro jogador, geridos pelo admin
// (permissão wiki.manage) sem precisar de deploy pra publicar/editar
// conteúdo novo.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("wiki_articles", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      categoria: { type: Sequelize.STRING(60), allowNull: false },
      slug: { type: Sequelize.STRING(150), allowNull: false, unique: true },
      titulo: { type: Sequelize.STRING(200), allowNull: false },
      resumo: { type: Sequelize.STRING(300), allowNull: true },
      conteudo: { type: Sequelize.TEXT, allowNull: false },
      ordem: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      imagem_url: { type: Sequelize.STRING(500), allowNull: true },
      publicado: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_by_admin_id: { type: Sequelize.INTEGER, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex("wiki_articles", ["categoria"]);

    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'wiki.manage' LIMIT 1;`,
    );
    if (existente.length === 0) {
      await queryInterface.sequelize.query(
        `INSERT INTO admin_permissions (chave, descricao, "createdAt", "updatedAt")
         VALUES ('wiki.manage', 'Gerenciar artigos da Wiki do Jogo', now(), now());`,
      );
    }
    const [[permissao]] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'wiki.manage' LIMIT 1;`,
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
      `DELETE FROM admin_role_permissions WHERE id_permission = (SELECT id FROM admin_permissions WHERE chave = 'wiki.manage');`,
    );
    await queryInterface.sequelize.query(`DELETE FROM admin_permissions WHERE chave = 'wiki.manage';`);
    await queryInterface.dropTable("wiki_articles");
  },
};
