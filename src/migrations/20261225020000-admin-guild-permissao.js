"use strict";

// Painel Administrativo — Guilda (Balanceamento/Níveis/Boss/Missões).
// Nenhuma tabela nova: reaproveita os models existentes do domínio de
// Guilda (GuildLevelConfig/GuildBossConfig/GuildMission) e um novo
// GameSetting-backed override em guildConfig.js (mesmo padrão de
// expedition.balance/fishing.manage).
module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'guild.manage' LIMIT 1;`,
    );
    if (existente.length === 0) {
      await queryInterface.sequelize.query(
        `INSERT INTO admin_permissions (chave, descricao, "createdAt", "updatedAt")
         VALUES ('guild.manage', 'Gerenciar Balanceamento, Níveis, Boss e Missões de Guilda', now(), now());`,
      );
    }
    const [[permissao]] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'guild.manage' LIMIT 1;`,
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
      `DELETE FROM admin_role_permissions WHERE id_permission = (SELECT id FROM admin_permissions WHERE chave = 'guild.manage');`,
    );
    await queryInterface.sequelize.query(`DELETE FROM admin_permissions WHERE chave = 'guild.manage';`);
  },
};
