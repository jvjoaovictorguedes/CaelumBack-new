"use strict";

// Evento "O Coração da Máquina Celestial" — Fase 9 (Sistema de pistas e
// Caderno de Investigação). Duas tabelas novas:
//
// 1. puzzle_clue_definitions — catálogo ADMIN de pistas, uma por
//    PuzzleBlueprint (identidade lógica, nunca uma Version específica —
//    mesmo raciocínio de "objective_id é só uma string referenciada
//    livremente pelo engine, nunca validada contra um schema de versão
//    fixo"). Cada pista declara seu próprio gatilho: ou um objective_id
//    específico do puzzle (OBJECTIVE_COMPLETED) ou a conclusão inteira
//    do puzzle (INSTANCE_COMPLETED) — nunca as duas coisas ao mesmo
//    tempo (CHECK abaixo).
//
// 2. character_clue_unlocks — histórico IDEMPOTENTE de desbloqueio por
//    personagem. UNIQUE(id_personagem, id_clue_definition) é a garantia
//    real contra duplicação (puzzleClueService.sincronizarDesbloqueios
//    sempre faz bulkCreate com ignoreDuplicates, nunca um
//    INSERT solto) — mesma preocupação de "historical-claim
//    duplication" já tratada em outras features deste projeto
//    (ex.: sorteio raro, recompensas de caçada).
module.exports = {
  async up(queryInterface, Sequelize) {
    const S = Sequelize;

    await queryInterface.createTable("puzzle_clue_definitions", {
      id: { type: S.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_blueprint: {
        type: S.INTEGER,
        allowNull: false,
        references: { model: "puzzle_blueprints", key: "id" },
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
      },
      key: { type: S.STRING(60), allowNull: false },
      titulo: { type: S.STRING(160), allowNull: false },
      // Conteúdo revelado no Caderno de Investigação — nunca exposto
      // antes do desbloqueio real (ver puzzleClueService.obterCaderno,
      // que omite este campo inteiro pra pistas ainda bloqueadas, nunca
      // manda vazio/mascarado — o cliente não recebe NADA que entregue
      // o conteúdo antes da hora).
      texto: { type: S.TEXT, allowNull: false },
      trigger_type: {
        type: S.ENUM("OBJECTIVE_COMPLETED", "INSTANCE_COMPLETED"),
        allowNull: false,
      },
      // Obrigatório quando trigger_type=OBJECTIVE_COMPLETED (precisa
      // bater com um objectives[].id do config do Blueprint — nunca
      // validado contra uma Version específica aqui, só pela própria
      // natureza do engine: objetivosConcluidos é um Set de strings
      // livre, o mesmo objective_id funciona em qualquer revisão que
      // ainda declare esse id); NULL quando INSTANCE_COMPLETED.
      objective_id: { type: S.STRING(60), allowNull: true },
      // Ordem de exibição no Caderno — nunca a ordem de desbloqueio
      // real (que varia por jogador).
      ordem: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: S.DATE, allowNull: false, defaultValue: S.literal("NOW()") },
      updatedAt: { type: S.DATE, allowNull: false, defaultValue: S.literal("NOW()") },
    });
    await queryInterface.addConstraint("puzzle_clue_definitions", {
      fields: ["id_blueprint", "key"],
      type: "unique",
      name: "puzzle_clue_definitions_id_blueprint_key_unique",
    });
    await queryInterface.sequelize.query(
      `ALTER TABLE puzzle_clue_definitions ADD CONSTRAINT puzzle_clue_definitions_gatilho_coerente
       CHECK (
         (trigger_type = 'OBJECTIVE_COMPLETED' AND objective_id IS NOT NULL)
         OR (trigger_type = 'INSTANCE_COMPLETED' AND objective_id IS NULL)
       );`,
    );
    await queryInterface.addIndex("puzzle_clue_definitions", ["id_blueprint"]);

    await queryInterface.createTable("character_clue_unlocks", {
      id: { type: S.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      // Nullable + SET NULL — mesma política de puzzle_participants
      // (histórico de desbloqueio sobrevive à exclusão da conta).
      id_personagem: {
        type: S.INTEGER,
        allowNull: true,
        references: { model: "Characters", key: "id" },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },
      id_clue_definition: {
        type: S.INTEGER,
        allowNull: false,
        references: { model: "puzzle_clue_definitions", key: "id" },
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
      },
      unlocked_at: { type: S.DATE, allowNull: false, defaultValue: S.literal("NOW()") },
      createdAt: { type: S.DATE, allowNull: false, defaultValue: S.literal("NOW()") },
      updatedAt: { type: S.DATE, allowNull: false, defaultValue: S.literal("NOW()") },
    });
    // Garantia real de idempotência — nunca 2 linhas pro mesmo
    // personagem+pista, mesmo sob 2 ações concorrentes que ambas
    // satisfazem o mesmo gatilho ao mesmo tempo.
    await queryInterface.addConstraint("character_clue_unlocks", {
      fields: ["id_personagem", "id_clue_definition"],
      type: "unique",
      name: "character_clue_unlocks_id_personagem_id_clue_definition_unique",
    });
    await queryInterface.addIndex("character_clue_unlocks", ["id_personagem"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("character_clue_unlocks");
    await queryInterface.dropTable("puzzle_clue_definitions");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_puzzle_clue_definitions_trigger_type";');
  },
};
