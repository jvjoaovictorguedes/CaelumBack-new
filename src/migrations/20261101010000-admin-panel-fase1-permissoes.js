"use strict";

// Painel Administrativo — Fase 1 (Especificação Painel Administrativo §3):
// completa o catálogo de permissões com as chaves que a spec pede e que
// a fundação (20261029010000) ainda não tinha: equipmentsets.manage,
// powers.manage, spoils.manage, hunts.manage, events.manage.
//
// "events.manage" é nova (cobre Buff Global, categoria Eventos); mantemos
// "tournaments.manage" como está (spec §3 manda preservar permissões
// atuais) — Torneios continua usando a chave própria, só muda de
// categoria no hub (Eventos em vez de Sistema).
module.exports = {
  async up(queryInterface) {
    const NOVAS_PERMISSOES = [
      ["equipmentsets.manage", "Criar/editar/desativar Conjuntos de Equipamentos"],
      ["powers.manage", "Criar/editar habilidades (catálogo Power) e seus vínculos"],
      ["spoils.manage", "Templates de Encomenda do Balcão de Espólios"],
      ["hunts.manage", "Templates e configuração de dificuldade das Caçadas"],
      ["events.manage", "Buff Global e outros eventos temporais"],
    ];

    for (const [chave, descricao] of NOVAS_PERMISSOES) {
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM admin_permissions WHERE chave = :chave LIMIT 1;`,
        { replacements: { chave } },
      );
      if (existente.length === 0) {
        await queryInterface.sequelize.query(
          `INSERT INTO admin_permissions (chave, descricao, "createdAt", "updatedAt") VALUES (:chave, :descricao, now(), now());`,
          { replacements: { chave, descricao } },
        );
      }
    }

    // SuperAdmin ganha automaticamente tudo que já não tinha.
    const [[superAdminRole]] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_roles WHERE nome = 'SuperAdmin' LIMIT 1;`,
    );

    // Conteúdo ganha as chaves de conteúdo novas; Eventos ganha events.manage.
    const EXTENSOES_ROLE = {
      Conteudo: ["equipmentsets.manage", "powers.manage", "spoils.manage", "hunts.manage"],
      Eventos: ["events.manage"],
    };

    const rolesParaEstender = { ...EXTENSOES_ROLE };
    if (superAdminRole) {
      rolesParaEstender.SuperAdmin = NOVAS_PERMISSOES.map(([chave]) => chave);
    }

    for (const [nomeRole, chaves] of Object.entries(rolesParaEstender)) {
      const [[role]] = await queryInterface.sequelize.query(
        `SELECT id FROM admin_roles WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: nomeRole } },
      );
      if (!role) continue;

      for (const chave of chaves) {
        const [[permissao]] = await queryInterface.sequelize.query(
          `SELECT id FROM admin_permissions WHERE chave = :chave LIMIT 1;`,
          { replacements: { chave } },
        );
        if (!permissao) continue;
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
    const CHAVES = ["equipmentsets.manage", "powers.manage", "spoils.manage", "hunts.manage", "events.manage"];
    for (const chave of CHAVES) {
      await queryInterface.sequelize.query(
        `DELETE FROM admin_role_permissions WHERE id_permission = (SELECT id FROM admin_permissions WHERE chave = :chave);`,
        { replacements: { chave } },
      );
      await queryInterface.sequelize.query(`DELETE FROM admin_permissions WHERE chave = :chave;`, {
        replacements: { chave },
      });
    }
  },
};
