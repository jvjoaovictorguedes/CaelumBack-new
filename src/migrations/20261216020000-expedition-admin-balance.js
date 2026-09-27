// Painel Administrativo de Expedição — permissão única `expedition.balance`
// cobrindo, na mesma tela, o balanceamento de Expedição (tempo/drops/
// progressão + Emboscada), Aventura (perigo) e Aventura em Grupo
// (escala/limites) — pedido explícito do jogador de juntar essas 3
// telas de balanceamento num painel só (mesmo padrão de permissão de
// forge.manage/forge.balance, mas aqui uma permissão só basta porque é
// uma única tela, sem CRUD de conteúdo separado).
module.exports = {
  async up(queryInterface) {
    const chave = "expedition.balance";
    const descricao = "Editar parâmetros globais de Expedição (tempo/drops/progressão/emboscada), perigo de Aventura e escala de Aventura em Grupo";

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

    const rolesParaEstender = ["Conteudo", "SuperAdmin"];
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
      `DELETE FROM admin_role_permissions WHERE id_permission IN (SELECT id FROM admin_permissions WHERE chave = 'expedition.balance');`,
    );
    await queryInterface.sequelize.query(`DELETE FROM admin_permissions WHERE chave = 'expedition.balance';`);
  },
};
