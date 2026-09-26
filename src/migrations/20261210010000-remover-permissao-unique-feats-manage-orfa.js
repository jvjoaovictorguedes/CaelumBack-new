"use strict";

// Limpeza pós-merge: a migration 20261209010000 criou "unique-feats.manage"
// pra um painel admin de Proezas Únicas simplificado que colidiu (mesmo
// domínio, mesmas rotas) com o painel completo já existente (§19 —
// uniquefeats.manage/uniquefeats.repair, migration 20261206010000).
// Decisão do usuário: manter o painel completo, descartar o simplificado —
// "unique-feats.manage" (com hífen) fica órfã, sem nenhuma rota
// referenciando mais ela. down() recria a permissão (sem os vínculos de
// role, que não são reversíveis com certeza) só por simetria.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM admin_role_permissions WHERE id_permission = (SELECT id FROM admin_permissions WHERE chave = 'unique-feats.manage');`,
    );
    await queryInterface.sequelize.query(`DELETE FROM admin_permissions WHERE chave = 'unique-feats.manage';`);
  },

  async down(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'unique-feats.manage' LIMIT 1;`,
    );
    if (existente.length === 0) {
      await queryInterface.sequelize.query(
        `INSERT INTO admin_permissions (chave, descricao, "createdAt", "updatedAt")
         VALUES ('unique-feats.manage', 'Cadastrar Proezas Únicas e a Habilidade Única vinculada', now(), now());`,
      );
    }
  },
};
