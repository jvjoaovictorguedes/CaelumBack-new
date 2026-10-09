"use strict";

// Evento "O Coração da Máquina Celestial" — Fase 10 (Discovery/Pioneer).
// Mesma separação catálogo-admin + histórico-idempotente da Fase 9
// (puzzle_clue_definitions/character_clue_unlocks), mas com uma
// diferença estrutural real: um PioneerMilestone é uma corrida com vaga
// LIMITADA (max_claims, default 1 — "o primeiro/os 3 primeiros a
// descobrir X") — a garantia de "nunca 2 jogadores ganham a mesma
// posição" não dá pra ser só UNIQUE(milestone, personagem) como as
// pistas; precisa de UNIQUE(id_milestone, posicao) + a lógica de
// atribuir `posicao` tem que rodar sob lock de verdade (ver
// puzzlePioneerService.sincronizarConquistas — mesmo padrão de "trava a
// linha estável antes de decidir" já usado em
// puzzleBlueprintService.criarNovaVersao).
//
// Diferença deliberada de puzzle_clue_definitions: titulo/descricao
// aqui são SEMPRE públicos (mesmo antes de qualquer claim) — Hall das
// Lendas (Fase 11) mostra "ainda não descoberto" como teaser, nunca
// esconde a existência do feito como as pistas escondem conteúdo
// narrativo.
module.exports = {
  async up(queryInterface, Sequelize) {
    const S = Sequelize;

    await queryInterface.createTable("puzzle_pioneer_milestones", {
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
      descricao: { type: S.TEXT, allowNull: false },
      trigger_type: {
        type: S.ENUM("OBJECTIVE_COMPLETED", "INSTANCE_COMPLETED"),
        allowNull: false,
      },
      objective_id: { type: S.STRING(60), allowNull: true },
      // Quantas posições existem nessa corrida — 1 = só "o pioneiro";
      // >1 = "os N primeiros" (ex.: pódio de 3). Nunca 0/negativo.
      max_claims: { type: S.INTEGER, allowNull: false, defaultValue: 1 },
      ordem: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: S.DATE, allowNull: false, defaultValue: S.literal("NOW()") },
      updatedAt: { type: S.DATE, allowNull: false, defaultValue: S.literal("NOW()") },
    });
    await queryInterface.addConstraint("puzzle_pioneer_milestones", {
      fields: ["id_blueprint", "key"],
      type: "unique",
      name: "puzzle_pioneer_milestones_id_blueprint_key_unique",
    });
    await queryInterface.sequelize.query(
      `ALTER TABLE puzzle_pioneer_milestones ADD CONSTRAINT puzzle_pioneer_milestones_gatilho_coerente
       CHECK (
         (trigger_type = 'OBJECTIVE_COMPLETED' AND objective_id IS NOT NULL)
         OR (trigger_type = 'INSTANCE_COMPLETED' AND objective_id IS NULL)
       );`,
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE puzzle_pioneer_milestones ADD CONSTRAINT puzzle_pioneer_milestones_max_claims_positivo
       CHECK (max_claims > 0);`,
    );
    await queryInterface.addIndex("puzzle_pioneer_milestones", ["id_blueprint"]);

    await queryInterface.createTable("puzzle_pioneer_claims", {
      id: { type: S.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_milestone: {
        type: S.INTEGER,
        allowNull: false,
        references: { model: "puzzle_pioneer_milestones", key: "id" },
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
      },
      // Nullable + SET NULL — mesma política de puzzle_participants; o
      // snapshot de nome é o que sobra pro Hall das Lendas continuar
      // legível (diferente das pistas, aqui o "quem" é o próprio
      // conteúdo público, nunca pode desaparecer por completo).
      id_personagem: {
        type: S.INTEGER,
        allowNull: true,
        references: { model: "Characters", key: "id" },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },
      personagem_nome_snapshot: { type: S.STRING(120), allowNull: false },
      // 1 = o pioneiro de verdade; 2/3/... só existe quando
      // max_claims > 1 no milestone.
      posicao: { type: S.INTEGER, allowNull: false },
      claimed_at: { type: S.DATE, allowNull: false, defaultValue: S.literal("NOW()") },
      createdAt: { type: S.DATE, allowNull: false, defaultValue: S.literal("NOW()") },
      updatedAt: { type: S.DATE, allowNull: false, defaultValue: S.literal("NOW()") },
    });
    await queryInterface.sequelize.query(
      `ALTER TABLE puzzle_pioneer_claims ADD CONSTRAINT puzzle_pioneer_claims_posicao_positiva
       CHECK (posicao > 0);`,
    );
    // Nunca o mesmo personagem 2x no mesmo milestone.
    await queryInterface.addConstraint("puzzle_pioneer_claims", {
      fields: ["id_milestone", "id_personagem"],
      type: "unique",
      name: "puzzle_pioneer_claims_id_milestone_id_personagem_unique",
    });
    // A garantia real da corrida: nunca 2 claims na MESMA posição do
    // MESMO milestone — combinado com o lock em
    // puzzlePioneerService.sincronizarConquistas (nunca só esta
    // constraint sozinha, que só pega o erro DEPOIS de já ter gasto um
    // round-trip; o lock é o que evita a corrida de verdade).
    await queryInterface.addConstraint("puzzle_pioneer_claims", {
      fields: ["id_milestone", "posicao"],
      type: "unique",
      name: "puzzle_pioneer_claims_id_milestone_posicao_unique",
    });
    await queryInterface.addIndex("puzzle_pioneer_claims", ["id_personagem"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("puzzle_pioneer_claims");
    await queryInterface.dropTable("puzzle_pioneer_milestones");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_puzzle_pioneer_milestones_trigger_type";');
  },
};
