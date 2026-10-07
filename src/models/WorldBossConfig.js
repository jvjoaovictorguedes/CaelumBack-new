const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Boss Global (Caelum_Boss_Global.docx) — catálogo de Ameaças Mundiais.
// Editar um config NUNCA afeta um evento em andamento (ver
// WorldBossEvent.config_snapshot, congelado no início do ciclo — §18/§19).
const WorldBossConfig = sequelize.define(
  "WorldBossConfig",
  {
    ...require("./combatTypingModels").fields.monster,
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    nome: { type: DataTypes.STRING(150), allowNull: false },
    descricao: { type: DataTypes.TEXT, allowNull: false },
    lore: { type: DataTypes.TEXT, allowNull: true },
    imagem_url: { type: DataTypes.STRING, allowNull: true },
    // Fundo de batalha dedicado (WorldBossBattleScene.tsx) — sem isso a
    // cena usava a própria imagem_url (retrato do Boss) borrada como
    // fundo, por falta de campo próprio. Opcional: sem fundo_url
    // cadastrado, o front cai nesse mesmo fallback borrado.
    fundo_url: { type: DataTypes.STRING, allowNull: true },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    peso_selecao: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    vida_base: { type: DataTypes.BIGINT, allowNull: false },
    defesa: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    mensagem_descoberta: { type: DataTypes.TEXT, allowNull: false },
    mensagem_convocacao: { type: DataTypes.TEXT, allowNull: false },
    mensagem_fase_final: { type: DataTypes.TEXT, allowNull: true },
    mensagem_derrota: { type: DataTypes.TEXT, allowNull: true },
    id_item_golpe_final: { type: DataTypes.INTEGER, allowNull: false },
    gold_descoberta: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    gold_participacao: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    xp_participacao: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    min_dano_participacao: { type: DataTypes.BIGINT, allowNull: true },
    // Ameaça Mundial V2 §4.1 — atributos de combate do Boss, compatíveis
    // com as mesmas fórmulas de PvE/PvP (combatFormulas.js). vida_base
    // continua o HP GLOBAL explícito (nunca derivado de vitalidade).
    nivel: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, validate: { min: 1 } },
    forca: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
    vitalidade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
    agilidade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
    inteligencia: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
    velocidade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
    mana_maxima: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
    regeneracao_mana_por_acao: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
    // §3.2 — intervalo base do relógio global do Boss (ms); fases podem
    // sobrescrever via WorldBossPhase.intervalo_acao_ms.
    intervalo_acao_ms: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3000, validate: { min: 1 } },
    // §8.2 — reentrada configurável; primeira entrega pode manter false
    // (mais seguro) sem exigir migration nova pra ligar depois.
    reentrada_permitida: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    cooldown_reentrada_segundos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
  },
  { tableName: "world_boss_configs" },
);

module.exports = WorldBossConfig;
