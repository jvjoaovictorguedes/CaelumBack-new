// Evento "O Coração da Máquina Celestial" — Fase 1 (Fundação Persistente,
// Schemas e Ciclo de Vida). Permissão própria do domínio de Eventos de
// Puzzle — nunca reaproveitar `events.manage` (já é do Buff Global,
// AdminHubClient.tsx linha 75) nem nenhuma permissão de Guilda
// (GuildRolePermission é um sistema totalmente diferente de
// AdminPermission — confusão já identificada na Fase 0). Concedida às
// roles "Eventos" (já existe, hoje só com tournaments.manage) e
// "SuperAdmin" — mesmo padrão de 20270113010000-playershop-admin-permissao.js.
module.exports = {
  async up(queryInterface) {
    const permissoes = [
      ["event_puzzle.view", "Consultar Eventos de Puzzle (definições, edições, blueprints e instâncias)"],
      ["event_puzzle.manage", "Criar/publicar/arquivar Eventos de Puzzle (definições, edições e blueprints)"],
    ];

    for (const [chave, descricao] of permissoes) {
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

    const rolesParaEstender = ["Eventos", "SuperAdmin"];
    for (const [chave] of permissoes) {
      const [[permissao]] = await queryInterface.sequelize.query(
        `SELECT id FROM admin_permissions WHERE chave = :chave LIMIT 1;`,
        { replacements: { chave } },
      );
      if (!permissao) continue;

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
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM admin_role_permissions WHERE id_permission IN (
         SELECT id FROM admin_permissions WHERE chave IN ('event_puzzle.view', 'event_puzzle.manage')
       );`,
    );
    await queryInterface.sequelize.query(
      `DELETE FROM admin_permissions WHERE chave IN ('event_puzzle.view', 'event_puzzle.manage');`,
    );
  },
};
