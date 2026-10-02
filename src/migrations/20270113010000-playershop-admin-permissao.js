// Painel Administrativo — permissão `playershop.manage` pra configurar
// a Loja do Aventureiro V2 (taxas/limites/prazos/kill-switch) e
// moderar lojas/demandas/encomendas (mesmo padrão de
// expedition.balance/market.moderate: permissão própria pra não
// obrigar quem cuida disso a também ter economy.manage).
module.exports = {
  async up(queryInterface) {
    const chave = "playershop.manage";
    const descricao = "Configurar taxas/limites/prazos da Loja do Aventureiro e moderar lojas/demandas/encomendas";

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

    const [[permissao]] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = :chave LIMIT 1;`,
      { replacements: { chave } },
    );
    if (!permissao) return;

    const rolesParaEstender = ["Economia", "SuperAdmin"];
    for (const nomeRole of rolesParaEstender) {
      const [[role]] = await queryInterface.sequelize.query(
        `SELECT id FROM admin_roles WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: nomeRole } },
      );
      if (!role) continue;
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
      `DELETE FROM admin_role_permissions WHERE id_permission IN (SELECT id FROM admin_permissions WHERE chave = 'playershop.manage');`,
    );
    await queryInterface.sequelize.query(`DELETE FROM admin_permissions WHERE chave = 'playershop.manage';`);
  },
};
