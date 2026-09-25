const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Uma linha por VERSÃO de um asset (ver migration 20261108010000). A
// listagem admin normal e o serving público sempre filtram ativo=true —
// use o scope "comDados" só quando precisar dos bytes de verdade
// (servir o arquivo), nunca na listagem (evita carregar imagens
// inteiras só pra montar uma tabela).
const MediaAsset = sequelize.define(
  "MediaAsset",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    grupo: { type: DataTypes.STRING(150), allowNull: false },
    versao: { type: DataTypes.INTEGER, allowNull: false },
    categoria: {
      type: DataTypes.ENUM("Item", "Power", "Monster", "EquipmentSet", "Musica", "Outro"),
      allowNull: false,
      defaultValue: "Outro",
    },
    // "imagem" (padrão, compatível com todas as linhas antigas) ou
    // "audio" — controla qual validação roda no service (sharp/dimensão
    // vs magic bytes de áudio) e se largura_px/altura_px fazem sentido
    // (sempre null pra áudio).
    tipo: {
      type: DataTypes.ENUM("imagem", "audio"),
      allowNull: false,
      defaultValue: "imagem",
    },
    nome_arquivo_original: { type: DataTypes.STRING(255), allowNull: true },
    mime: { type: DataTypes.STRING(100), allowNull: false },
    tamanho_bytes: { type: DataTypes.INTEGER, allowNull: false },
    largura_px: { type: DataTypes.INTEGER, allowNull: true },
    altura_px: { type: DataTypes.INTEGER, allowNull: true },
    dados: { type: DataTypes.BLOB("long"), allowNull: false },
    descricao: { type: DataTypes.TEXT, allowNull: true },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    id_admin_criador: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    tableName: "media_assets",
    defaultScope: {
      attributes: { exclude: ["dados"] },
    },
    scopes: {
      comDados: {},
    },
  },
);

module.exports = MediaAsset;
