"use strict";

// Sistema de Referral — no registro, o jogador pode informar o username
// de quem o indicou; o painel admin ganha uma área nova ("Referral")
// mostrando quem foi indicado, por quem, e quantas indicações no total
// aquele indicador já tem.
//
// id_indicado_por é self-referencing (users -> users), SET NULL (não
// CASCADE): se a conta do indicador for excluída depois, o registro de
// quem foi indicado sobrevive (só perde a referência de QUEM indicou,
// como qualquer coluna de histórico/auditoria já tratada nas migrations
// de exclusão de conta — nunca precisa apagar o indicado junto).
//
// Permissão nova ("referrals.view") em vez de reaproveitar "players.view"
// — dá pro painel controlar o acesso a essa análise separado de quem só
// pode consultar jogador por nome/ID. Mesma distribuição de roles que
// "players.view" já usa (SuperAdmin/GameMaster/Suporte), por ser dado
// do mesmo tipo (informação de jogador, não conteúdo do jogo).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const colunas = await queryInterface.describeTable("users");
      if (!colunas.id_indicado_por) {
        await queryInterface.addColumn(
          "users",
          "id_indicado_por",
          {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: "users", key: "id" },
            onDelete: "SET NULL",
            onUpdate: "CASCADE",
          },
          { transaction },
        );
        await queryInterface.addIndex("users", ["id_indicado_por"], { transaction });
      }

      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM admin_permissions WHERE chave = 'referrals.view' LIMIT 1;`,
        { transaction },
      );
      if (existente.length === 0) {
        await queryInterface.sequelize.query(
          `INSERT INTO admin_permissions (chave, descricao, "createdAt", "updatedAt")
           VALUES ('referrals.view', 'Consultar indicações (quem indicou quem, e quantas vezes)', now(), now());`,
          { transaction },
        );
      }

      const [[permissao]] = await queryInterface.sequelize.query(
        `SELECT id FROM admin_permissions WHERE chave = 'referrals.view' LIMIT 1;`,
        { transaction },
      );
      if (!permissao) return;

      const [roles] = await queryInterface.sequelize.query(
        `SELECT id FROM admin_roles WHERE nome IN ('SuperAdmin', 'GameMaster', 'Suporte');`,
        { transaction },
      );
      for (const role of roles) {
        await queryInterface.sequelize.query(
          `INSERT INTO admin_role_permissions (id_role, id_permission, "createdAt", "updatedAt")
           VALUES (:idRole, :idPermission, now(), now())
           ON CONFLICT DO NOTHING;`,
          { replacements: { idRole: role.id, idPermission: permissao.id }, transaction },
        );
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `DELETE FROM admin_role_permissions WHERE id_permission = (SELECT id FROM admin_permissions WHERE chave = 'referrals.view');`,
        { transaction },
      );
      await queryInterface.sequelize.query(`DELETE FROM admin_permissions WHERE chave = 'referrals.view';`, { transaction });

      const colunas = await queryInterface.describeTable("users");
      if (colunas.id_indicado_por) {
        await queryInterface.removeColumn("users", "id_indicado_por", { transaction });
      }
    });
  },
};
