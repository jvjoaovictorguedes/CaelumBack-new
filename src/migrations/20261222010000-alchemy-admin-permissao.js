"use strict";

// Alquimia/Caldeirão — a gameplay (models/services/rotas de jogador) já
// existe desde a Fase 1 (alchemy-fundacao), mas nunca ganhou um Admin
// pra gerenciar receitas sem editar código/seed diretamente. Esta
// migration só adiciona a permissão; o CRUD entra em
// adminAlchemyService/Controller/Routes na mesma leva.
module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'alchemy.manage' LIMIT 1;`,
    );
    if (existente.length === 0) {
      await queryInterface.sequelize.query(
        `INSERT INTO admin_permissions (chave, descricao, "createdAt", "updatedAt")
         VALUES ('alchemy.manage', 'Criar/editar/desativar receitas de Alquimia (Caldeirão)', now(), now());`,
      );
    }
    const [[permissao]] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'alchemy.manage' LIMIT 1;`,
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
      `DELETE FROM admin_role_permissions WHERE id_permission = (SELECT id FROM admin_permissions WHERE chave = 'alchemy.manage');`,
    );
    await queryInterface.sequelize.query(`DELETE FROM admin_permissions WHERE chave = 'alchemy.manage';`);
  },
};
