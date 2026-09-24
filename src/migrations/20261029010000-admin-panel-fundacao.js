"use strict";

// Painel Administrativo §6-9/§44/§61 — fundação: Item.ativo/
// negociavel_mercado, permissões granulares (AdminRole/AdminPermission/
// AdminRolePermission/UserAdminRole) e auditoria imutável
// (AdminActionLog). User.isAdmin continua a porta de entrada (§7 —
// mantido por compatibilidade); as permissões só REFINAM o que um admin
// pode fazer depois de já ter passado por isAdmin.
//
// Todo User com isAdmin=true HOJE ganha a role SuperAdmin automaticamente
// (com todas as permissões do catálogo inicial) — ninguém perde acesso
// no dia em que esta migration rodar.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    const colunasItems = await queryInterface.describeTable("Items");
    if (!colunasItems.ativo) {
      await queryInterface.addColumn("Items", "ativo", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }
    if (!colunasItems.negociavel_mercado) {
      await queryInterface.addColumn("Items", "negociavel_mercado", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }

    if (!tabelas.includes("admin_roles")) {
      await queryInterface.createTable("admin_roles", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        nome: { type: Sequelize.STRING(80), allowNull: false, unique: true },
        descricao: { type: Sequelize.TEXT, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    if (!tabelas.includes("admin_permissions")) {
      await queryInterface.createTable("admin_permissions", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        chave: { type: Sequelize.STRING(80), allowNull: false, unique: true },
        descricao: { type: Sequelize.TEXT, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    if (!tabelas.includes("admin_role_permissions")) {
      await queryInterface.createTable("admin_role_permissions", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_role: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "admin_roles", key: "id" },
          onDelete: "CASCADE",
        },
        id_permission: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "admin_permissions", key: "id" },
          onDelete: "CASCADE",
        },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addConstraint("admin_role_permissions", {
        fields: ["id_role", "id_permission"],
        type: "unique",
        name: "admin_role_permissions_role_permission_unique",
      });
    }

    if (!tabelas.includes("user_admin_roles")) {
      await queryInterface.createTable("user_admin_roles", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_user: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "users", key: "id" },
          onDelete: "CASCADE",
        },
        id_role: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "admin_roles", key: "id" },
          onDelete: "CASCADE",
        },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addConstraint("user_admin_roles", {
        fields: ["id_user", "id_role"],
        type: "unique",
        name: "user_admin_roles_user_role_unique",
      });
    }

    if (!tabelas.includes("admin_action_logs")) {
      await queryInterface.createTable("admin_action_logs", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_admin: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "users", key: "id" },
        },
        acao: { type: Sequelize.STRING(80), allowNull: false },
        entidade: { type: Sequelize.STRING(80), allowNull: false },
        id_entidade: { type: Sequelize.INTEGER, allowNull: true },
        dados_antes: { type: Sequelize.JSONB, allowNull: true },
        dados_depois: { type: Sequelize.JSONB, allowNull: true },
        motivo: { type: Sequelize.TEXT, allowNull: true },
        ip: { type: Sequelize.STRING(64), allowNull: true },
        user_agent: { type: Sequelize.TEXT, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addIndex("admin_action_logs", ["id_admin"]);
      await queryInterface.addIndex("admin_action_logs", ["entidade", "id_entidade"]);
      await queryInterface.addIndex("admin_action_logs", ["createdAt"]);
    }

    if (!tabelas.includes("game_settings")) {
      await queryInterface.createTable("game_settings", {
        chave: { type: Sequelize.STRING(80), primaryKey: true, allowNull: false },
        valor: { type: Sequelize.JSONB, allowNull: false },
        descricao: { type: Sequelize.TEXT, allowNull: true },
        tipo: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "json" },
        editavel_admin: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        updated_by_admin_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "users", key: "id" },
        },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    // Catálogo inicial de permissões (§6) — chaves estáveis, nunca lidas
    // por nome em português em código nenhum.
    const PERMISSOES = [
      ["items.manage", "Criar/editar/desativar itens e propriedades"],
      ["shop.manage", "Disponibilidade e preços da Loja NPC"],
      ["market.moderate", "Moderar anúncios do Mercado P2P"],
      ["economy.manage", "Configurações econômicas (GameSetting)"],
      ["missions.manage", "Missões livres, Guilda dos Aventureiros, Missões de Guilda"],
      ["adventure.manage", "Monstros, zonas, aparição e loot da Aventura"],
      ["players.view", "Consultar jogador (perfil, inventário)"],
      ["players.manage", "Correções administrativas de inventário"],
      ["players.reward", "Conceder premiações a jogadores"],
      ["media.manage", "Upload e versionamento de mídia administrativa"],
      ["tournaments.manage", "Torneios e eventos"],
      ["patchnotes.manage", "Publicar Patch Notes"],
      ["admins.manage", "Gerenciar administradores e suas roles"],
      ["audit.view", "Consultar histórico de ações administrativas"],
    ];

    for (const [chave, descricao] of PERMISSOES) {
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

    // Roles sugeridas (§6) — SuperAdmin ganha TODAS as permissões; as
    // outras são só um ponto de partida razoável, um SuperAdmin pode
    // reconfigurar cada uma depois pela tela de Administradores.
    const ROLES = {
      SuperAdmin: PERMISSOES.map(([chave]) => chave),
      Conteudo: ["items.manage", "adventure.manage", "missions.manage", "media.manage"],
      Economia: ["shop.manage", "market.moderate", "economy.manage"],
      GameMaster: ["players.view", "players.manage", "players.reward"],
      Eventos: ["tournaments.manage"],
      Suporte: ["players.view", "audit.view"],
    };

    for (const [nomeRole, chaves] of Object.entries(ROLES)) {
      const [existenteRole] = await queryInterface.sequelize.query(
        `SELECT id FROM admin_roles WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: nomeRole } },
      );
      let idRole = existenteRole[0]?.id;
      if (!idRole) {
        const [[criada]] = await queryInterface.sequelize.query(
          `INSERT INTO admin_roles (nome, descricao, "createdAt", "updatedAt") VALUES (:nome, :descricao, now(), now()) RETURNING id;`,
          { replacements: { nome: nomeRole, descricao: `Role padrão ${nomeRole} (Painel Administrativo)` } },
        );
        idRole = criada.id;
      }

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
          { replacements: { idRole, idPermission: permissao.id } },
        );
      }
    }

    // Todo admin JÁ existente (User.isAdmin=true) ganha SuperAdmin —
    // ninguém perde acesso no dia em que isto rodar (§7).
    const [[superAdminRole]] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_roles WHERE nome = 'SuperAdmin' LIMIT 1;`,
    );
    if (superAdminRole) {
      await queryInterface.sequelize.query(
        `INSERT INTO user_admin_roles (id_user, id_role, "createdAt", "updatedAt")
         SELECT id, :idRole, now(), now() FROM "users" WHERE "isAdmin" = true
         ON CONFLICT DO NOTHING;`,
        { replacements: { idRole: superAdminRole.id } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("game_settings");
    await queryInterface.dropTable("admin_action_logs");
    await queryInterface.dropTable("user_admin_roles");
    await queryInterface.dropTable("admin_role_permissions");
    await queryInterface.dropTable("admin_permissions");
    await queryInterface.dropTable("admin_roles");
    await queryInterface.removeColumn("Items", "negociavel_mercado");
    await queryInterface.removeColumn("Items", "ativo");
  },
};
