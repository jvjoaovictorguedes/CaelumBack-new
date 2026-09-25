const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Registro de idempotência de brew (spec §14/§15/§28) — PK composta
// (id_personagem, idempotency_key); um retry com a mesma chave lê a
// linha existente e devolve o `resultado` já persistido em vez de
// debitar/creditar/conceder XP de novo.
const AlchemyBrewIdempotency = sequelize.define(
  "AlchemyBrewIdempotency",
  {
    id_personagem: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    idempotency_key: { type: DataTypes.STRING(120), primaryKey: true, allowNull: false },
    id_recipe: { type: DataTypes.INTEGER, allowNull: false },
    resultado: { type: DataTypes.JSONB, allowNull: false },
  },
  { tableName: "alchemy_brew_idempotency", timestamps: true, updatedAt: false },
);

module.exports = AlchemyBrewIdempotency;
