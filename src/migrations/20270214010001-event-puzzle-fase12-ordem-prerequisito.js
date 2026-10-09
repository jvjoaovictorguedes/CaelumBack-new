"use strict";

// Evento "O Coração da Máquina Celestial" — Fase 12 (Conteúdo completo
// do evento / fluxo end-to-end). Até aqui PuzzleBlueprint não tinha
// nenhuma noção de ORDEM nem de PRÉ-REQUISITO — qualquer blueprint
// publicado podia ser instanciado por qualquer personagem em qualquer
// momento, sem progressão nenhuma entre salas (achado da auditoria pré-
// Fase 12: "não existe conceito de progressão entre salas").
//
// Decisão: cadeia linear simples (um prerequisito por blueprint, nunca
// um DAG geral) — suficiente pra "resolva a Oficina → depois o
// Observatório → depois a Sala das Marés → depois o Núcleo da
// Convergência", e mantém a validação em
// puzzleInstanceService.criarOuObterInstancia trivial (um único check,
// nunca uma travessia de grafo). Se o design futuro precisar de
// múltiplos pré-requisitos por blueprint, isso é uma tabela nova
// (puzzle_blueprint_prerequisites), não uma FK a mais aqui.
module.exports = {
  async up(queryInterface, Sequelize) {
    const S = Sequelize;
    await queryInterface.addColumn("puzzle_blueprints", "ordem", {
      type: S.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn("puzzle_blueprints", "id_blueprint_prerequisito", {
      type: S.INTEGER,
      allowNull: true,
      references: { model: "puzzle_blueprints", key: "id" },
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    // Nunca um blueprint referenciando a si mesmo como pré-requisito —
    // trivialmente detectável e sem utilidade nenhuma (ciclo de 1 nó).
    await queryInterface.sequelize.query(
      `ALTER TABLE puzzle_blueprints ADD CONSTRAINT puzzle_blueprints_prerequisito_nao_e_si_mesmo
       CHECK (id_blueprint_prerequisito IS NULL OR id_blueprint_prerequisito <> id);`,
    );
    await queryInterface.addIndex("puzzle_blueprints", ["id_event_definition", "ordem"]);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("puzzle_blueprints", ["id_event_definition", "ordem"]);
    await queryInterface.sequelize.query(
      `ALTER TABLE puzzle_blueprints DROP CONSTRAINT puzzle_blueprints_prerequisito_nao_e_si_mesmo;`,
    );
    await queryInterface.removeColumn("puzzle_blueprints", "id_blueprint_prerequisito");
    await queryInterface.removeColumn("puzzle_blueprints", "ordem");
  },
};
