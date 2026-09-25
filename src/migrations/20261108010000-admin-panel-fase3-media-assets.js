"use strict";

// Painel Administrativo — Fase 3 (§ "Biblioteca de Mídia", permissão
// media.manage já cadastrada em 20261029010000: "Upload e versionamento
// de mídia administrativa"). Cada upload pertence a um "grupo" (slug
// estável escolhido pelo admin, ex.: "espada-flamejante-icone") — subir
// de novo pro MESMO grupo cria uma nova VERSÃO em vez de sobrescrever,
// então nada perde histórico. Bytes ficam no Postgres (bytea), mesmo
// padrão já usado por Guild.emblema_imagem (guildEmblemController.js) —
// sem depender de disco local ou S3.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("media_assets", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      grupo: { type: Sequelize.STRING(150), allowNull: false },
      versao: { type: Sequelize.INTEGER, allowNull: false },
      categoria: {
        type: Sequelize.ENUM("Item", "Power", "Monster", "EquipmentSet", "Outro"),
        allowNull: false,
        defaultValue: "Outro",
      },
      nome_arquivo_original: { type: Sequelize.STRING(255), allowNull: true },
      mime: { type: Sequelize.STRING(100), allowNull: false },
      tamanho_bytes: { type: Sequelize.INTEGER, allowNull: false },
      largura_px: { type: Sequelize.INTEGER, allowNull: true },
      altura_px: { type: Sequelize.INTEGER, allowNull: true },
      dados: { type: Sequelize.BLOB("long"), allowNull: false },
      descricao: { type: Sequelize.TEXT, allowNull: true },
      // true só na versão CORRENTE de cada grupo — é o que /api/media/:grupo
      // serve por padrão. Subir uma nova versão desliga a anterior dentro
      // da mesma transação (ver mediaAssetService.uploadMediaAsset).
      ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      id_admin_criador: { type: Sequelize.INTEGER, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
    });

    await queryInterface.addIndex("media_assets", ["grupo", "versao"], {
      unique: true,
      name: "media_assets_grupo_versao_unique",
    });
    // Consultada em toda leitura pública (GET /api/media/:grupo) e na
    // listagem admin (uma linha por grupo) — sempre filtrando por grupo
    // e, na maioria dos casos, também por ativo=true.
    await queryInterface.addIndex("media_assets", ["grupo", "ativo"], {
      name: "media_assets_grupo_ativo_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("media_assets");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_media_assets_categoria";');
  },
};
