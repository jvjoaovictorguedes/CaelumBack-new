// Evento "O Coração da Máquina Celestial" — Fase 1 (Fundação Persistente,
// Schemas e Ciclo de Vida). 6 models consolidados num arquivo só, mesmo
// padrão de combatTypingModels.js (domínio novo, tabelas fortemente
// relacionadas) — não o 1-model-por-arquivo usado em domínios antigos.
//
// Nenhuma regra de negócio aqui — lifecycle/transições/filtragem de DTO
// vivem nos services (eventDefinitionService, eventEditionService,
// puzzleBlueprintService, puzzleInstanceService). Ver essas pastas pro
// raciocínio completo de cada decisão.
const { DataTypes: D } = require("sequelize");
const { sequelize } = require("../config/database");

const timestamps = { createdAt: "createdAt", updatedAt: "updatedAt" };

const EventDefinition = sequelize.define(
  "EventDefinition",
  {
    id: { type: D.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    key: { type: D.STRING(60), allowNull: false, unique: true },
    nome: { type: D.STRING(160), allowNull: false },
    descricao: { type: D.TEXT, allowNull: true },
    status: {
      type: D.ENUM("DRAFT", "PUBLISHED", "ARCHIVED"),
      allowNull: false,
      defaultValue: "DRAFT",
    },
    metadata: { type: D.JSONB, allowNull: true },
  },
  { tableName: "event_definitions", ...timestamps },
);

const EventEdition = sequelize.define(
  "EventEdition",
  {
    id: { type: D.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_event_definition: {
      type: D.INTEGER,
      allowNull: false,
      references: { model: "event_definitions", key: "id" },
    },
    key: { type: D.STRING(60), allowNull: false },
    nome: { type: D.STRING(160), allowNull: false },
    status: {
      type: D.ENUM("DRAFT", "SCHEDULED", "ACTIVE", "ENDED", "CANCELLED"),
      allowNull: false,
      defaultValue: "DRAFT",
    },
    starts_at: { type: D.DATE, allowNull: true },
    ends_at: { type: D.DATE, allowNull: true },
    metadata: { type: D.JSONB, allowNull: true },
  },
  { tableName: "event_editions", ...timestamps },
);

const PuzzleBlueprint = sequelize.define(
  "PuzzleBlueprint",
  {
    id: { type: D.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_event_definition: {
      type: D.INTEGER,
      allowNull: false,
      references: { model: "event_definitions", key: "id" },
    },
    key: { type: D.STRING(60), allowNull: false },
    nome: { type: D.STRING(160), allowNull: false },
    descricao: { type: D.TEXT, allowNull: true },
  },
  { tableName: "puzzle_blueprints", ...timestamps },
);

// Identidade lógica (PuzzleBlueprint) + revisão imutável publicada
// (PuzzleBlueprintVersion) — ver migration 20270208020000 pro raciocínio
// completo. PuzzleInstance sempre referencia a VERSION, nunca a
// identidade, pra nunca ser afetada por edição de draft posterior.
const PuzzleBlueprintVersion = sequelize.define(
  "PuzzleBlueprintVersion",
  {
    id: { type: D.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_blueprint: {
      type: D.INTEGER,
      allowNull: false,
      references: { model: "puzzle_blueprints", key: "id" },
    },
    version: { type: D.INTEGER, allowNull: false },
    status: {
      type: D.ENUM("DRAFT", "PUBLISHED", "ARCHIVED"),
      allowNull: false,
      defaultValue: "DRAFT",
    },
    // Pode conter campos secretos (golden_solution etc.) — nunca
    // devolvidos num DTO público/runtime sem filtragem explícita no
    // service (ver puzzleBlueprintService.dtoPublico/dtoAdmin).
    config: { type: D.JSONB, allowNull: false, defaultValue: {} },
    published_at: { type: D.DATE, allowNull: true },
    published_by_admin_id: {
      type: D.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
    },
  },
  { tableName: "puzzle_blueprint_versions", ...timestamps },
);

const PuzzleInstance = sequelize.define(
  "PuzzleInstance",
  {
    id: { type: D.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_event_edition: {
      type: D.INTEGER,
      allowNull: false,
      references: { model: "event_editions", key: "id" },
    },
    // Referência exata e IMUTÁVEL à revisão usada na criação.
    id_blueprint_version: {
      type: D.INTEGER,
      allowNull: false,
      references: { model: "puzzle_blueprint_versions", key: "id" },
    },
    status: {
      type: D.ENUM("CREATED", "ACTIVE", "COMPLETED", "FAILED", "ABANDONED", "EXPIRED"),
      allowNull: false,
      defaultValue: "CREATED",
    },
    // Convenção reservada: só `state.public` sai em DTO de runtime —
    // qualquer outra chave é só-servidor (ver puzzleInstanceService.
    // dtoRuntime). Nunca config estrutural (isso é do Blueprint/version).
    state: { type: D.JSONB, allowNull: false, defaultValue: {} },
    // Autoritativo no Postgres — ver puzzleInstanceService.
    // aplicarMutacao pro UPDATE condicional que é a garantia real.
    state_version: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
    seed: { type: D.STRING(64), allowNull: false },
    started_at: { type: D.DATE, allowNull: true },
    completed_at: { type: D.DATE, allowNull: true },
    expires_at: { type: D.DATE, allowNull: true },
  },
  { tableName: "puzzle_instances", ...timestamps },
);

const PuzzleParticipant = sequelize.define(
  "PuzzleParticipant",
  {
    id: { type: D.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_instance: {
      type: D.INTEGER,
      allowNull: false,
      references: { model: "puzzle_instances", key: "id" },
    },
    id_personagem: {
      type: D.INTEGER,
      allowNull: true,
      references: { model: "Characters", key: "id" },
    },
    personagem_nome_snapshot: { type: D.STRING(120), allowNull: false },
    role: { type: D.STRING(20), allowNull: false, defaultValue: "SOLO" },
    joined_at: { type: D.DATE, allowNull: false, defaultValue: D.NOW },
    left_at: { type: D.DATE, allowNull: true },
  },
  { tableName: "puzzle_participants", ...timestamps },
);

module.exports = {
  EventDefinition,
  EventEdition,
  PuzzleBlueprint,
  PuzzleBlueprintVersion,
  PuzzleInstance,
  PuzzleParticipant,
};
