const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const ForgeBlueprint = sequelize.define(
  "ForgeBlueprint",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    nome: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    categoria_equipamento: {
      type: DataTypes.ENUM("Arma", "Armadura", "Capacete", "Escudo", "Acessorio1", "Acessorio2", "Ferramenta"),
      allowNull: false,
    },
    multiplicador_tempo: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1 },
    nivel_forja_minimo: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // Tier fixo da receita (1 = mais forte, 5 = mais básico) — todos os
    // ForgeBlueprintResult deste blueprint (uma por Raridade) apontam
    // pra Items com o MESMO tier_equipamento (spec de Tier §18).
    // Nullable só até a migration de backfill rodar; daqui pra frente
    // todo blueprint novo precisa vir com Tier.
    tier_equipamento: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 1, max: 5 } },
    // Reformulação V2 (migration 20261207010000-item-unico-raridade-por-
    // instancia-expand): o Item canônico que este blueprint produz —
    // qualidade deixa de escolher outro Item (ForgeBlueprintResult) e
    // passa a virar CharacterEquipmentInstance.raridade da cópia
    // coletada. Nullable só até o Backfill decidir o canônico de cada
    // blueprint (a variante Comum). ForgeBlueprintResult é removido no
    // Contract, depois que Forja/Refino/Sets tiverem migrado.
    id_item_resultado: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: "forge_blueprints" },
);

module.exports = ForgeBlueprint;
