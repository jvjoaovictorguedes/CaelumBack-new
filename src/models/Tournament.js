const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Torneio (PvP v2 §16). Criado e operado exclusivamente por
// administradores; jogadores só se inscrevem e jogam.
//
// O prêmio NUNCA é creditado automaticamente: `prize_delivered` é um
// marcador informativo que um admin liga depois de entregar na mão. O
// sistema não move ouro/item nenhum por causa de torneio.
const Tournament = sequelize.define(
  "Tournament",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    level_min: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    level_max: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 999 },
    starts_at: { type: DataTypes.DATE, allowNull: false },
    max_participants: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 8 },
    prize_description: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM(
        "Rascunho",
        "InscricoesAbertas",
        "InscricoesFechadas",
        "EmAndamento",
        "Finalizado",
        "Cancelado",
      ),
      allowNull: false,
      defaultValue: "Rascunho",
    },
    prize_delivered: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    created_by: { type: DataTypes.INTEGER, allowNull: false },
    // Chaveamento sorteado, persistido UMA vez no start (§16): sobrevive
    // a restart e nunca é regerado numa releitura.
    bracket_seed: { type: DataTypes.JSONB, allowNull: true },
    bracket_gerado_em: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "tournaments" },
);

module.exports = Tournament;
