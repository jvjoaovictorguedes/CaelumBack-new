"use strict";

// Painel Administrativo — Premiações (§ ampliação pedida pelo usuário):
// admin passa a poder cadastrar Proezas Únicas (e sua Habilidade Única
// vinculada) e concedê-las manualmente a um personagem direto do painel.
// Cadastro de catálogo (criar/editar Proeza) usa uma permissão NOVA
// ("unique-feats.manage", mesmo padrão de powers.manage/equipmentsets.
// manage da Fase 1); a CONCESSÃO em si reaproveita "players.reward" (já
// existente, mesma permissão de Premiações de ouro/XP/item).
module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'unique-feats.manage' LIMIT 1;`,
    );
    if (existente.length === 0) {
      await queryInterface.sequelize.query(
        `INSERT INTO admin_permissions (chave, descricao, "createdAt", "updatedAt")
         VALUES ('unique-feats.manage', 'Cadastrar Proezas Únicas e a Habilidade Única vinculada', now(), now());`,
      );
    }

    const [[permissao]] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'unique-feats.manage' LIMIT 1;`,
    );
    if (!permissao) return;

    const [roles] = await queryInterface.sequelize.query(
      `SELECT id, nome FROM admin_roles WHERE nome IN ('SuperAdmin', 'Conteudo');`,
    );
    for (const role of roles) {
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
      `DELETE FROM admin_role_permissions WHERE id_permission = (SELECT id FROM admin_permissions WHERE chave = 'unique-feats.manage');`,
    );
    await queryInterface.sequelize.query(`DELETE FROM admin_permissions WHERE chave = 'unique-feats.manage';`);
  },
};
