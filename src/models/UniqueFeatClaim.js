const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Registro atômico da conquista de uma Proeza Única (§5.2). A UNIQUE em
// id_unique_feat É a garantia de "um vencedor global" — o service tenta
// o INSERT dentro de uma transaction e trata violação de unicidade como
// "outra pessoa venceu" (resultado normal, nunca erro de sistema).
const UniqueFeatClaim = sequelize.define(
  "UniqueFeatClaim",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_unique_feat: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    // Nullable desde a migration de correção de exclusão de conta —
    // ON DELETE SET NULL (nunca CASCADE): apagar a claim junto com o
    // personagem liberaria a Proeza pra ser reclamada de novo, o que
    // quebraria a garantia de "um vencedor pra sempre" que a UNIQUE
    // acima existe pra proteger. character_name_snapshot abaixo é quem
    // preserva "quem venceu" mesmo depois da conta ser excluída.
    id_personagem: { type: DataTypes.INTEGER, allowNull: true },
    character_name_snapshot: { type: DataTypes.STRING(100), allowNull: false },
    claimed_at: { type: DataTypes.DATE, allowNull: false },
    trigger_key: { type: DataTypes.STRING(60), allowNull: false },
    trigger_snapshot: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    source_event_id: { type: DataTypes.STRING(150), allowNull: true },
    status: { type: DataTypes.ENUM("VALID", "REVOKED"), allowNull: false, defaultValue: "VALID" },
    repair_metadata: { type: DataTypes.JSONB, allowNull: true },
  },
  { tableName: "unique_feat_claims" },
);

module.exports = UniqueFeatClaim;
