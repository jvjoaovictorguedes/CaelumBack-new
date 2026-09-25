"use strict";

// Painel Administrativo de Músicas — Fase 1 (Fundação): tabelas do
// domínio Music (próprio, ver "IMPORTANT" da spec — não reaproveita
// media_assets) + permissões music.manage/music.publish, concedidas às
// roles Conteudo e SuperAdmin (mesmo padrão de
// 20261115010000-taverna-fase1-fundacao.js /
// 20261121010000-admin-fishing-permissao.js).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("music_tracks", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      key: { type: Sequelize.STRING(80), allowNull: false, unique: true },
      nome: { type: Sequelize.STRING(120), allowNull: false },
      descricao: { type: Sequelize.TEXT, allowNull: true },
      loop: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      default_volume: { type: Sequelize.FLOAT, allowNull: true },
      ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
    });

    await queryInterface.createTable("music_track_file_versions", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_track: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "music_tracks", key: "id" },
        onDelete: "CASCADE",
      },
      versao: { type: Sequelize.INTEGER, allowNull: false },
      nome_arquivo_original: { type: Sequelize.STRING(255), allowNull: true },
      mime: { type: Sequelize.STRING(100), allowNull: false },
      tamanho_bytes: { type: Sequelize.INTEGER, allowNull: false },
      duracao_ms: { type: Sequelize.INTEGER, allowNull: true },
      storage_key: { type: Sequelize.STRING(255), allowNull: true },
      dados: { type: Sequelize.BLOB("long"), allowNull: false },
      checksum_sha256: { type: Sequelize.STRING(64), allowNull: false },
      ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      id_admin_criador: { type: Sequelize.INTEGER, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
    });
    await queryInterface.addConstraint("music_track_file_versions", {
      fields: ["id_track", "versao"],
      type: "unique",
      name: "music_track_file_versions_track_versao_unique",
    });

    await queryInterface.createTable("music_pools", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      key: { type: Sequelize.STRING(80), allowNull: false, unique: true },
      nome: { type: Sequelize.STRING(120), allowNull: false },
      descricao: { type: Sequelize.TEXT, allowNull: true },
      ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
    });

    await queryInterface.createTable("music_config_versions", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      version_number: { type: Sequelize.INTEGER, allowNull: false, unique: true },
      status: { type: Sequelize.ENUM("DRAFT", "PUBLISHED", "ARCHIVED"), allowNull: false, defaultValue: "DRAFT" },
      notes: { type: Sequelize.TEXT, allowNull: true },
      created_by: { type: Sequelize.INTEGER, allowNull: true },
      published_by: { type: Sequelize.INTEGER, allowNull: true },
      published_at: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
    });

    await queryInterface.createTable("music_assignments", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_config_version: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "music_config_versions", key: "id" },
        onDelete: "CASCADE",
      },
      slot_key: { type: Sequelize.STRING(80), allowNull: false },
      assignment_type: { type: Sequelize.ENUM("TRACK", "POOL", "SILENCE"), allowNull: false },
      id_track: { type: Sequelize.INTEGER, allowNull: true, references: { model: "music_tracks", key: "id" } },
      id_pool: { type: Sequelize.INTEGER, allowNull: true, references: { model: "music_pools", key: "id" } },
      fade_ms: { type: Sequelize.INTEGER, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
    });
    await queryInterface.addConstraint("music_assignments", {
      fields: ["id_config_version", "slot_key"],
      type: "unique",
      name: "music_assignments_config_slot_unique",
    });

    await queryInterface.createTable("music_pool_track_assignments", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_config_version: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "music_config_versions", key: "id" },
        onDelete: "CASCADE",
      },
      id_pool: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "music_pools", key: "id" },
        onDelete: "CASCADE",
      },
      id_track: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "music_tracks", key: "id" },
        onDelete: "CASCADE",
      },
      peso: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      ordem: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
    });
    await queryInterface.addConstraint("music_pool_track_assignments", {
      fields: ["id_config_version", "id_pool", "id_track"],
      type: "unique",
      name: "music_pool_track_assignments_unique",
    });

    // Permissões music.manage / music.publish (§5), concedidas às roles
    // Conteudo e SuperAdmin — mesmo padrão de todas as permissões de
    // módulo administrativo já criadas neste projeto.
    for (const [chave, descricao] of [
      ["music.manage", "Criar/editar faixas, versões de arquivo, pools e rascunho de configuração de música"],
      ["music.publish", "Publicar/reverter configuração de música e ativar versão de arquivo de áudio"],
    ]) {
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
      for (const nomeRole of ["Conteudo", "SuperAdmin"]) {
        const [[role]] = await queryInterface.sequelize.query(
          `SELECT id FROM admin_roles WHERE nome = :nome LIMIT 1;`,
          { replacements: { nome: nomeRole } },
        );
        if (!role || !permissao) continue;
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
      `DELETE FROM admin_role_permissions WHERE id_permission IN (SELECT id FROM admin_permissions WHERE chave IN ('music.manage','music.publish'));`,
    );
    await queryInterface.sequelize.query(`DELETE FROM admin_permissions WHERE chave IN ('music.manage','music.publish');`);
    await queryInterface.dropTable("music_pool_track_assignments");
    await queryInterface.dropTable("music_assignments");
    await queryInterface.dropTable("music_config_versions");
    await queryInterface.dropTable("music_pools");
    await queryInterface.dropTable("music_track_file_versions");
    await queryInterface.dropTable("music_tracks");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_music_assignments_assignment_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_music_config_versions_status";');
  },
};
