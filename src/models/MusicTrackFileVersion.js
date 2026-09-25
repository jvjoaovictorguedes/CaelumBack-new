const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Painel Administrativo de Músicas §3.2 — uma versão FÍSICA do áudio de
// uma track. Upload novo NUNCA sobrescreve; cria uma linha nova. Mesmo
// raciocínio de MediaAsset: `dados` (BLOB) fica fora do defaultScope pra
// listagens não carregarem o arquivo inteiro à toa — só o scope
// "comDados" (streaming/download) inclui.
const MusicTrackFileVersion = sequelize.define(
  "MusicTrackFileVersion",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_track: { type: DataTypes.INTEGER, allowNull: false },
    versao: { type: DataTypes.INTEGER, allowNull: false },
    nome_arquivo_original: { type: DataTypes.STRING(255), allowNull: true },
    mime: { type: DataTypes.STRING(100), allowNull: false },
    tamanho_bytes: { type: DataTypes.INTEGER, allowNull: false },
    duracao_ms: { type: DataTypes.INTEGER, allowNull: true },
    // storage_key: abstração pra um object storage futuro (§3.2) — hoje
    // sempre null, os bytes vivem em `dados` (mesmo padrão de
    // MediaAsset.dados já em produção neste projeto).
    storage_key: { type: DataTypes.STRING(255), allowNull: true },
    dados: { type: DataTypes.BLOB("long"), allowNull: false },
    checksum_sha256: { type: DataTypes.STRING(64), allowNull: false },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    id_admin_criador: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    tableName: "music_track_file_versions",
    defaultScope: { attributes: { exclude: ["dados"] } },
    scopes: { comDados: {} },
  },
);

module.exports = MusicTrackFileVersion;
