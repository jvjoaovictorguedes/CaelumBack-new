const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const AdventureMonster = require("./AdventureMonster");

// Efeito(s) de status que um MONSTRO pode causar ao acertar o jogador —
// mesmo princípio de PowerStatusEffect/WeaponStatusEffect (tabela filha,
// opt-in: monstro sem nenhuma linha aqui é um monstro normal, só ataque
// básico). Sem potency_scale_attribute: AdventureMonster usa stats FIXOS
// (§5.3/§9.3), então a potência também é um número fixo cadastrado pelo
// admin, nunca derivada de um atributo de Character que o monstro nem tem.
const MonsterStatusEffect = sequelize.define(
  "MonsterStatusEffect",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_monstro: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: AdventureMonster, key: "id" },
    },
    status_key: { type: DataTypes.STRING(20), allowNull: false },
    // Partes por milhão (1.000.000 = 100%), mesmo padrão do projeto.
    chance_ppm: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    duration_turns: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    potency_base: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "monster_status_effects" },
);

module.exports = MonsterStatusEffect;
