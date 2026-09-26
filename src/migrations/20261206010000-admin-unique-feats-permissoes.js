"use strict";

// Sistema de Proezas Únicas §19.5 — permissões do módulo "Proezas
// Únicas" no Painel Administrativo. `uniquefeats.manage` cobre o CRUD
// normal (Proezas/Legados/Triggers); `uniquefeats.repair` é SEPARADA e
// MAIS FORTE de propósito (§19.4/§19.5 — reparo excepcional de claim é
// exceção de SuperAdmin, nunca operação comum de Conteudo).
module.exports = {
  async up(queryInterface) {
    const PERMISSOES = [
      ["uniquefeats.manage", "Gerenciar Proezas Únicas (catálogo, Legados, Triggers)"],
      ["uniquefeats.repair", "Reparo excepcional de Proezas Únicas (revogar/transferir claim) — SuperAdmin"],
    ];

    for (const [chave, descricao] of PERMISSOES) {
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM admin_permissions WHERE chave = :chave LIMIT 1;`,
        { replacements: { chave } },
      );
      if (existente.length === 0) {
        await queryInterface.sequelize.query(
          `INSERT INTO admin_permissions (chave, descricao, "createdAt", "updatedAt")
           VALUES (:chave, :descricao, now(), now());`,
          { replacements: { chave, descricao } },
        );
      }
    }

    // uniquefeats.manage: Conteudo + SuperAdmin (mesmo padrão de todo
    // outro módulo de conteúdo). uniquefeats.repair: SÓ SuperAdmin.
    const rolesPorPermissao = {
      "uniquefeats.manage": ["Conteudo", "SuperAdmin"],
      "uniquefeats.repair": ["SuperAdmin"],
    };

    for (const [chave, roles] of Object.entries(rolesPorPermissao)) {
      const [[permissao]] = await queryInterface.sequelize.query(
        `SELECT id FROM admin_permissions WHERE chave = :chave LIMIT 1;`,
        { replacements: { chave } },
      );
      if (!permissao) continue;
      for (const nomeRole of roles) {
        // eslint-disable-next-line no-await-in-loop -- migration roda uma vez, sequencial é suficiente
        const [[role]] = await queryInterface.sequelize.query(
          `SELECT id FROM admin_roles WHERE nome = :nome LIMIT 1;`,
          { replacements: { nome: nomeRole } },
        );
        if (!role) continue;
        // eslint-disable-next-line no-await-in-loop -- mesmo motivo acima
        await queryInterface.sequelize.query(
          `INSERT INTO admin_role_permissions (id_role, id_permission, "createdAt", "updatedAt")
           VALUES (:idRole, :idPermission, now(), now())
           ON CONFLICT DO NOTHING;`,
          { replacements: { idRole: role.id, idPermission: permissao.id } },
        );
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM admin_role_permissions
       WHERE id_permission IN (SELECT id FROM admin_permissions WHERE chave IN ('uniquefeats.manage', 'uniquefeats.repair'));`,
    );
    await queryInterface.sequelize.query(
      `DELETE FROM admin_permissions WHERE chave IN ('uniquefeats.manage', 'uniquefeats.repair');`,
    );
  },
};
