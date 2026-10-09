"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.createTable("character_world_state", {
        id_personagem: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false, references: { model: "Characters", key: "id" }, onDelete: "CASCADE" },
        mundo_habilitado: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        mapa_slug: { type: Sequelize.STRING(100), allowNull: false, defaultValue: "capital" },
        tile_x: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 200 },
        tile_y: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 90 },
        versao_posicao: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      }, { transaction });
      // O banco também limita os futuros writers; NaN/Infinity não são posições.
      await queryInterface.sequelize.query(`ALTER TABLE character_world_state
        ADD CONSTRAINT character_world_position_check CHECK (tile_x >= 0 AND tile_x < 400 AND tile_y >= 0 AND tile_y < 180 AND versao_posicao >= 0);`, { transaction });
      await queryInterface.sequelize.query(`INSERT INTO admin_permissions (chave, descricao, "createdAt", "updatedAt")
        VALUES ('world.manage', 'Liberar o mundo experimental por personagem', NOW(), NOW()) ON CONFLICT (chave) DO NOTHING`, { transaction });
      // Apenas SuperAdmin recebe acesso automaticamente ao rollout experimental.
      await queryInterface.sequelize.query(`INSERT INTO admin_role_permissions (id_role, id_permission, "createdAt", "updatedAt")
        SELECT r.id, p.id, NOW(), NOW() FROM admin_roles r CROSS JOIN admin_permissions p
        WHERE r.nome = 'SuperAdmin' AND p.chave = 'world.manage' ON CONFLICT DO NOTHING`, { transaction });
    });
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.dropTable("character_world_state", { transaction });
      await queryInterface.sequelize.query(`DELETE FROM admin_role_permissions WHERE id_permission IN (SELECT id FROM admin_permissions WHERE chave = 'world.manage')`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM admin_permissions WHERE chave = 'world.manage'`, { transaction });
    });
  },
};
