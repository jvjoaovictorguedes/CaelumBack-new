const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Profissão de Ferreiro §7/§9 — contadores de CARREIRA (nunca decrementados,
// nunca recalculados a partir de outra fonte — atualizados
// transacionalmente nos eventos reais de Fundição/Fabricação/
// Refinamento/aprendizado de Receita). Uma linha por personagem.
const CharacterForgeStats = sequelize.define(
  "CharacterForgeStats",
  {
    id_personagem: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    barras_fundidas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    equipamentos_fabricados: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    refinamentos_sucesso: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    refinamentos_falha: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    maior_refinamento_alcancado: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // { Comum: n, Incomum: n, ... } — contagem de qualidade FINAL fabricada.
    qualidades_fabricadas: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    receitas_aprendidas_comum: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    receitas_aprendidas_raro: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    receitas_aprendidas_lendario: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: "character_forge_stats" },
);

module.exports = CharacterForgeStats;
