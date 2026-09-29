const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Classes V2 §8 — requisito extensível de uma evolução de classe, sem
// precisar de uma coluna nova a cada tipo novo (era assim antes: nível,
// item, ouro e monstro-alvo eram 5 colunas soltas em
// ClassEvolutionPath). `reference_id` é usado quando o requisito aponta
// pra uma entidade com FK numérica de verdade (ex.: ITEM -> Item.id);
// `reference_key` é a chave estável textual pra requisito SEM entidade
// numérica — é o caso de MONSTER_KILL: CharacterMonsterKill (usado
// também pelo Bestiário/mastery, não só por Classes) é indexado por
// NOME de monstro em todo o jogo, não existe id_monstro estável pra
// abate; migrar isso é um projeto à parte, fora do escopo de Classes V2
// (registrado no relatório final). `config` guarda parâmetros extras
// específicos do tipo (ex.: ITEM com Forja V2 pode carregar
// raridade_minima quando o Item for instanciável — §8.2).
const ClassEvolutionRequirement = sequelize.define(
  "ClassEvolutionRequirement",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_evolucao: { type: DataTypes.INTEGER, allowNull: false },
    tipo: {
      type: DataTypes.ENUM(
        "LEVEL",
        "GOLD",
        "ITEM",
        "MONSTER_KILL",
        "ADVENTURE_GUILD_RANK",
        "ACHIEVEMENT",
        "REPUTATION",
        "QUEST",
      ),
      allowNull: false,
    },
    quantidade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    reference_id: { type: DataTypes.INTEGER, allowNull: true },
    reference_key: { type: DataTypes.STRING(150), allowNull: true },
    config: { type: DataTypes.JSONB, allowNull: true },
    ordem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    tableName: "class_evolution_requirements",
  },
);

module.exports = ClassEvolutionRequirement;
