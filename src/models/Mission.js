const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Mission = sequelize.define(
  "Mission",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    nome: { type: DataTypes.STRING(100), allowNull: false },
    descricao: { type: DataTypes.TEXT, allowNull: false },
    // Valores CompletarExpedicoes/Fabricar/CompletarContratosGuilda
    // adicionados ao ENUM real do banco pela migration
    // 20260930750000-guilda-aventureiros-tabelas.js (ALTER TYPE
    // enum_missions_tipo) — o model só declarava os 4 valores
    // originais, desalinhado do schema real (bug reportado: um form
    // administrativo de criação de missão precisa ver as 3 opções
    // novas também).
    tipo: {
      type: DataTypes.ENUM(
        "MatarInimigos",
        "VencerDuelos",
        "GanharOuro",
        "AlcancarNivel",
        "CompletarExpedicoes",
        "Fabricar",
        "CompletarContratosGuilda",
      ),
      allowNull: false,
    },
    meta: { type: DataTypes.INTEGER, allowNull: false },
    // Semanal/Mensal adicionados pela mesma migration (ALTER TYPE
    // enum_missions_categoria) — mesmo desalinhamento do campo acima.
    categoria: {
      type: DataTypes.ENUM("Diaria", "Unica", "Semanal", "Mensal"),
      allowNull: false,
      defaultValue: "Diaria",
    },
    nivel_minimo: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    recompensa_dinheiro: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    recompensa_xp: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    recompensa_item_id: { type: DataTypes.INTEGER, allowNull: true },
    recompensa_item_quantidade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    ativa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "missions" },
);

module.exports = Mission;
