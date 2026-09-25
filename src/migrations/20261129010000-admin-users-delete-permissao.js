"use strict";

// Painel Administrativo — Excluir Contas de Usuário (lista com
// seleção em massa, protege contas admin). Permissão isolada e restrita
// só a SuperAdmin (nunca ao role "Conteudo") por ser destrutiva — não
// segue o padrão de conceder a "Conteudo" que outras permissões de
// conteúdo/balanceamento usam.
module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'users.delete' LIMIT 1;`,
    );
    if (existente.length === 0) {
      await queryInterface.sequelize.query(
        `INSERT INTO admin_permissions (chave, descricao, "createdAt", "updatedAt")
         VALUES ('users.delete', 'Excluir contas de usuário (ação destrutiva e irreversível)', now(), now());`,
      );
    }
    const [[permissao]] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'users.delete' LIMIT 1;`,
    );
    const [[role]] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_roles WHERE nome = 'SuperAdmin' LIMIT 1;`,
    );
    if (role && permissao) {
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
      `DELETE FROM admin_role_permissions WHERE id_permission = (SELECT id FROM admin_permissions WHERE chave = 'users.delete');`,
    );
    await queryInterface.sequelize.query(`DELETE FROM admin_permissions WHERE chave = 'users.delete';`);
  },
};
