const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Árvore de evolução de CLASSE — cada classe tem N caminhos (subclasses)
// exclusivos entre si: o jogador escolhe UM, em definitivo (ver
// character.id_evolucao_classe). Diferente da árvore de Evolution (essa
// é por natureza mágica, comprada com ouro, cumulativa em vários nós) —
// aqui é nível alto + 1 item Mítico específico do caminho, dando um
// bônus permanente maior nos atributos, de uma vez só.
const ClassEvolutionPath = sequelize.define(
  "ClassEvolutionPath",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    id_classe: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    // Classes V2 §5.1 — chave estável pra UI/integrações, não depender
    // do nome (editável no Admin) pra lógica.
    slug: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    // 1 = Lv.40 (era o único estágio da V1), 2 = Lv.100, schema
    // preparado pra estágios futuros sem alterar Characters.
    estagio: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    // NULL no estágio 1; obrigatório no estágio >1 (validado em
    // classEvolutionService, não só no banco) — regra de linhagem §5.2:
    // pai e filho pertencem à mesma classe, estagio_filho = estagio_pai+1.
    id_evolucao_pai: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    icone_url: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    nome: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    descricao: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    nivel_necessario: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    // NULL = caminho não tem requisito de item embutido nesta coluna
    // legada — desde a Fase 2, requisito de ITEM real vem de
    // ClassEvolutionRequirement (ver migration 20261227010000).
    id_item_requisito: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    quantidade_item_requisito: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    // Sink de ouro (ver migration 20260930580000) — cobrado junto com
    // o item/nível/caça no momento de evoluir.
    custo_ouro: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    // Requisito de caça opcional (ver migration 20260930540000) — NULL
    // = caminho não exige matar nenhum monstro específico.
    nome_monstro_alvo: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    quantidade_monstro_necessaria: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    bonus_forca: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    bonus_vitalidade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    bonus_agilidade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    bonus_inteligencia: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    bonus_velocidade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    imagem_url: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    ordem: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: "class_evolution_paths",
  },
);

module.exports = ClassEvolutionPath;
