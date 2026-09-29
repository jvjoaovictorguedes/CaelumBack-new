"use strict";

// Sistema de Códigos de Resgate — devs cadastram um código com data de
// expiração e um pacote de recompensa (ouro/xp/itens), jogador resgata
// uma vez por personagem em Meu Personagem > Informações. Nova
// permissão "codes.manage" pro CRUD admin (concessão em si é uma ação
// do próprio jogador, não precisa de permissão de admin nenhuma).
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("redemption_codes")) {
      await queryInterface.createTable("redemption_codes", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        codigo: { type: Sequelize.STRING(64), allowNull: false, unique: true },
        recompensa: { type: Sequelize.JSONB, allowNull: false },
        expira_em: { type: Sequelize.DATE, allowNull: false },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        id_admin_criador: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "users", key: "id" },
          onDelete: "SET NULL",
        },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    if (!tabelas.includes("redemption_code_uses")) {
      await queryInterface.createTable("redemption_code_uses", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_redemption_code: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "redemption_codes", key: "id" },
          onDelete: "CASCADE",
        },
        id_personagem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        resgatado_em: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addConstraint("redemption_code_uses", {
        fields: ["id_redemption_code", "id_personagem"],
        type: "unique",
        name: "redemption_code_uses_codigo_personagem_unique",
      });
    }

    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'codes.manage' LIMIT 1;`,
    );
    if (existente.length === 0) {
      await queryInterface.sequelize.query(
        `INSERT INTO admin_permissions (chave, descricao, "createdAt", "updatedAt")
         VALUES ('codes.manage', 'Criar, editar e desativar códigos de resgate', now(), now());`,
      );
    }

    const [[permissao]] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'codes.manage' LIMIT 1;`,
    );
    if (permissao) {
      const [roles] = await queryInterface.sequelize.query(
        `SELECT id FROM admin_roles WHERE nome IN ('SuperAdmin', 'Eventos');`,
      );
      for (const role of roles) {
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
      `DELETE FROM admin_role_permissions WHERE id_permission = (SELECT id FROM admin_permissions WHERE chave = 'codes.manage');`,
    );
    await queryInterface.sequelize.query(`DELETE FROM admin_permissions WHERE chave = 'codes.manage';`);
    await queryInterface.dropTable("redemption_code_uses");
    await queryInterface.dropTable("redemption_codes");
  },
};
