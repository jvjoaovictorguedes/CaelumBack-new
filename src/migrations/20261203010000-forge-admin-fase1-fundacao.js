"use strict";

// Painel Administrativo da Forja — Fase 1: Fundação (spec §19).
// forge.manage (conteúdo: blueprints/barras/pergaminhos) e forge.balance
// (parâmetros globais de fundição/fabricação/refinamento/progressão) são
// permissões SEPARADAS (§2.1) — Conteúdo ganha as duas por padrão (não
// existe hoje um papel "Balanceamento" dedicado; SuperAdmin sempre ganha
// tudo). forge_scrolls.ativo é o campo que falta pra Pergaminhos terem
// ciclo de vida (Desativar/Reativar, §8) — ForgeScroll nunca teve esse
// campo. forge_operation_metrics é o ledger leve de telemetria (§13/§14.1)
// — CharacterForgeQueue é destruída na coleta (nunca vira histórico), e
// adminAuditService é auditoria ADMINISTRATIVA, não telemetria de
// jogador (§13: "domínios diferentes").
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    const colunasForgeScrolls = await queryInterface.describeTable("forge_scrolls");
    if (!colunasForgeScrolls.ativo) {
      await queryInterface.addColumn("forge_scrolls", "ativo", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }

    if (!tabelas.includes("forge_operation_metrics")) {
      await queryInterface.createTable("forge_operation_metrics", {
        id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true, allowNull: false },
        tipo_acao: { type: Sequelize.ENUM("Fundicao", "Fabricacao", "Refinamento"), allowNull: false },
        id_personagem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        id_blueprint: { type: Sequelize.INTEGER, allowNull: true },
        id_recurso: { type: Sequelize.INTEGER, allowNull: true },
        categoria_equipamento: { type: Sequelize.STRING(30), allowNull: true },
        qualidade_base: { type: Sequelize.STRING(20), allowNull: true },
        qualidade_final: { type: Sequelize.STRING(20), allowNull: true },
        alvo_refinamento: { type: Sequelize.INTEGER, allowNull: true },
        sucesso: { type: Sequelize.BOOLEAN, allowNull: true },
        gold_delta: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        xp_ganho: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        id_item_pergaminho: { type: Sequelize.INTEGER, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      await queryInterface.addIndex("forge_operation_metrics", ["tipo_acao", "createdAt"], {
        name: "forge_operation_metrics_tipo_data_idx",
      });
      await queryInterface.addIndex("forge_operation_metrics", ["id_blueprint"], {
        name: "forge_operation_metrics_blueprint_idx",
      });
    }

    const permissoes = [
      ["forge.manage", "Criar/editar/duplicar/desativar blueprints, barras e pergaminhos da Forja"],
      ["forge.balance", "Editar parâmetros globais de fundição/fabricação/refinamento/progressão da Forja"],
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

    const rolesParaEstender = ["Conteudo", "SuperAdmin"];
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
      `DELETE FROM admin_role_permissions WHERE id_permission IN (SELECT id FROM admin_permissions WHERE chave IN ('forge.manage', 'forge.balance'));`,
    );
    await queryInterface.sequelize.query(
      `DELETE FROM admin_permissions WHERE chave IN ('forge.manage', 'forge.balance');`,
    );
    await queryInterface.dropTable("forge_operation_metrics");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_forge_operation_metrics_tipo_acao";');
    await queryInterface.removeColumn("forge_scrolls", "ativo");
  },
};
