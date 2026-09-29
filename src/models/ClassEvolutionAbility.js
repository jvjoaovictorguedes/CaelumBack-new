const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Classes V2 §9 — Powers/CharacterAbilities concedidos por uma evolução
// de classe, reaproveitando o motor de poderes existente (nunca um
// segundo motor de skills). `auto_conceder=true` cria CharacterAbilities
// automaticamente ao adquirir a evolução; `ativar_se_houver_slot`
// respeita o limite de 5 habilidades ativas já existente (nunca
// ultrapassa). Powers com acquisition_scope=UNIQUE_FEAT nunca podem
// aparecer aqui — validado no service, nunca só no schema (§9 "validar
// server-side").
const ClassEvolutionAbility = sequelize.define(
  "ClassEvolutionAbility",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_evolucao: { type: DataTypes.INTEGER, allowNull: false },
    id_power: { type: DataTypes.INTEGER, allowNull: false },
    auto_conceder: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    ativar_se_houver_slot: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    tableName: "class_evolution_abilities",
  },
);

module.exports = ClassEvolutionAbility;
