const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// 2 slots independentes por personagem (Fundicao/Forja) — unique
// (id_personagem, slot) garante no máximo 1 trabalho por slot (ver
// migration). Resultado já sorteado no momento de iniciar, guardado em
// payload_resultado e só revelado na coleta (spec §49).
const CharacterForgeQueue = sequelize.define(
  "CharacterForgeQueue",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    slot: { type: DataTypes.ENUM("Fundicao", "Forja"), allowNull: false },
    tipo_acao: { type: DataTypes.ENUM("Fundicao", "Fabricacao", "Refinamento", "Pergaminho"), allowNull: false },
    referencia: { type: DataTypes.JSONB, allowNull: false },
    payload_resultado: { type: DataTypes.JSONB, allowNull: false },
    iniciado_em: { type: DataTypes.DATE, allowNull: false },
    pronto_em: { type: DataTypes.DATE, allowNull: false },
  },
  { tableName: "character_forge_queue" },
);

module.exports = CharacterForgeQueue;
