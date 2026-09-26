"use strict";

// Modo Manutenção (pedido do usuário): ao ativar, só admins conseguem
// usar o jogo — todo mundo mais vê uma tela amigável de manutenção.
// Guardado em game_settings (mesmo mecanismo já usado por outras
// configs administráveis, ver gameSettingCache.js) sob duas chaves:
// "maintenance.enabled" (boolean) e "maintenance.message" (string,
// editável — a mensagem amigável mostrada pro jogador).
//
// Permissão nova ("maintenance.manage") só pra SuperAdmin — é um
// kill-switch site-wide, deliberadamente mais restrito que as
// permissões de conteúdo/economia normais.
module.exports = {
  async up(queryInterface) {
    const MENSAGEM_PADRAO =
      "Estamos em manutenção para melhorar sua experiência. Voltamos em breve — obrigado pela paciência!";

    await queryInterface.sequelize.query(
      `INSERT INTO game_settings (chave, valor, descricao, tipo, editavel_admin, "createdAt", "updatedAt")
       VALUES ('maintenance.enabled', 'false', 'Modo Manutenção — só admins conseguem jogar quando ativo.', 'boolean', true, now(), now())
       ON CONFLICT (chave) DO NOTHING;`,
    );
    await queryInterface.sequelize.query(
      `INSERT INTO game_settings (chave, valor, descricao, tipo, editavel_admin, "createdAt", "updatedAt")
       VALUES ('maintenance.message', :mensagem, 'Modo Manutenção — mensagem amigável mostrada ao jogador.', 'string', true, now(), now())
       ON CONFLICT (chave) DO NOTHING;`,
      { replacements: { mensagem: JSON.stringify(MENSAGEM_PADRAO) } },
    );

    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'maintenance.manage' LIMIT 1;`,
    );
    if (existente.length === 0) {
      await queryInterface.sequelize.query(
        `INSERT INTO admin_permissions (chave, descricao, "createdAt", "updatedAt")
         VALUES ('maintenance.manage', 'Ativar/desativar o Modo Manutenção do jogo (só admins conseguem jogar)', now(), now());`,
      );
    }

    const [[permissao]] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'maintenance.manage' LIMIT 1;`,
    );
    const [[superAdmin]] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_roles WHERE nome = 'SuperAdmin' LIMIT 1;`,
    );
    if (permissao && superAdmin) {
      await queryInterface.sequelize.query(
        `INSERT INTO admin_role_permissions (id_role, id_permission, "createdAt", "updatedAt")
         VALUES (:idRole, :idPermission, now(), now())
         ON CONFLICT DO NOTHING;`,
        { replacements: { idRole: superAdmin.id, idPermission: permissao.id } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM admin_role_permissions WHERE id_permission = (SELECT id FROM admin_permissions WHERE chave = 'maintenance.manage');`,
    );
    await queryInterface.sequelize.query(`DELETE FROM admin_permissions WHERE chave = 'maintenance.manage';`);
    await queryInterface.sequelize.query(`DELETE FROM game_settings WHERE chave IN ('maintenance.enabled', 'maintenance.message');`);
  },
};
