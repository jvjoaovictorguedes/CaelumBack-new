const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Histórico de progressão da árvore de Evolução de Classe (Classes V2
// §6) — substitui Character.id_evolucao_classe como fonte de verdade.
// Um personagem tem no máximo UMA linha por estágio (Lv.40 = estágio 1,
// Lv.100 = estágio 2, preparado pra estágios futuros sem alterar
// Characters). Ver classEvolutionBonusService.js pra como o bônus é
// resolvido dinamicamente a partir daqui.
const CharacterClassEvolution = sequelize.define(
  "CharacterClassEvolution",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    id_evolucao: { type: DataTypes.INTEGER, allowNull: false },
    estagio: { type: DataTypes.INTEGER, allowNull: false },
    // §7.1 — true só em linhas criadas pelo backfill de migração
    // (personagens já evoluídos na V1, cujo bônus histórico exato não
    // pode ser provado e por isso não é subtraído nem reaplicado).
    // Evoluções novas (fluxo V2) são sempre false.
    legacy_bonus_materializado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    legacy_bonus_snapshot: { type: DataTypes.JSONB, allowNull: true },
    adquirida_em: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    tableName: "character_class_evolutions",
    timestamps: false,
    indexes: [
      { unique: true, fields: ["id_personagem", "estagio"], name: "character_class_evolutions_personagem_estagio_unique" },
      { unique: true, fields: ["id_personagem", "id_evolucao"], name: "character_class_evolutions_personagem_evolucao_unique" },
    ],
  },
);

module.exports = CharacterClassEvolution;
