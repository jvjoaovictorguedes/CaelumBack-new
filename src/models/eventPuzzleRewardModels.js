// Evento "O Coração da Máquina Celestial" — Fase 14 (Recompensas
// temáticas do evento). Mesma separação catálogo-admin + histórico
// idempotente das Fases 9/10 (pistas/pioneiros) — a diferença real é
// que PuzzleRewardDefinition carrega um PACOTE de recompensa (ouro/xp/
// item/conquista) em vez de só revelar texto ou registrar um claim, e
// CharacterPuzzleRewardGrant é a garantia de "nunca paga duas vezes" —
// nunca confiar em achievementService.grantByKey/rewardPayoutService
// isoladamente pra isso (eles são idempotentes nos PRÓPRIOS domínios,
// mas não sabem nada sobre "este personagem já recebeu ESTA definição
// de recompensa de puzzle").
const { DataTypes: D } = require("sequelize");
const { sequelize } = require("../config/database");

const timestamps = { createdAt: "createdAt", updatedAt: "updatedAt" };

const PuzzleRewardDefinition = sequelize.define(
  "PuzzleRewardDefinition",
  {
    id: { type: D.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_blueprint: {
      type: D.INTEGER,
      allowNull: false,
      references: { model: "puzzle_blueprints", key: "id" },
    },
    key: { type: D.STRING(60), allowNull: false },
    titulo_exibicao: { type: D.STRING(160), allowNull: false },
    descricao_exibicao: { type: D.TEXT, allowNull: false },
    trigger_type: {
      type: D.ENUM("OBJECTIVE_COMPLETED", "INSTANCE_COMPLETED"),
      allowNull: false,
    },
    objective_id: { type: D.STRING(60), allowNull: true },
    reward_ouro: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
    reward_xp: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
    // Item temático opcional (nunca equipamento instanciável nesta fase
    // — mesma simplificação deliberada do Boss, ver eventPuzzleBossModels.js:
    // loot rico/sorteável fica fora de escopo; aqui é sempre 1 stack fixo).
    id_item: {
      type: D.INTEGER,
      allowNull: true,
      references: { model: "Items", key: "id" },
    },
    item_quantidade: { type: D.INTEGER, allowNull: false, defaultValue: 1 },
    // Chave estável do catálogo de Achievement (achievementService.
    // grantByKey) — nunca um id numérico direto, pelo mesmo motivo que
    // o próprio achievementService usa key (admin pode recriar a linha
    // sem quebrar a referência). Se a Achievement tiver um Title ligado
    // (id_achievement_desbloqueia), o título vem de carona automaticamente.
    achievement_key: { type: D.STRING(60), allowNull: true },
    ordem: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: "puzzle_reward_definitions", ...timestamps },
);

const CharacterPuzzleRewardGrant = sequelize.define(
  "CharacterPuzzleRewardGrant",
  {
    id: { type: D.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: {
      type: D.INTEGER,
      allowNull: true,
      references: { model: "Characters", key: "id" },
    },
    id_reward_definition: {
      type: D.INTEGER,
      allowNull: false,
      references: { model: "puzzle_reward_definitions", key: "id" },
    },
    granted_at: { type: D.DATE, allowNull: false, defaultValue: D.NOW },
  },
  { tableName: "character_puzzle_reward_grants", ...timestamps },
);

module.exports = { PuzzleRewardDefinition, CharacterPuzzleRewardGrant };
