"use strict";

// Evento "O Coração da Máquina Celestial" — Fase 15 (Admin completo +
// validador de solvabilidade). `solvability_signature` guarda o hash
// de puzzleEngineCore.assinarConfig(config) NO MOMENTO em que uma
// sequência de ações foi simulada com sucesso (todos os objetivos
// concluídos) — ver puzzleBlueprintService.validarSolvabilidade.
// `solvability_validated_at` é só exibição no Admin ("validado em
// X"); nenhum dos dois é lido pelo engine/runtime do jogador, e nenhum
// bloqueia publicação por si só (editar o config depois de validar
// invalida silenciosamente a assinatura — o Admin decide revalidar).
module.exports = {
  async up(queryInterface, Sequelize) {
    const colunas = await queryInterface.describeTable("puzzle_blueprint_versions");
    if (!colunas.solvability_signature) {
      await queryInterface.addColumn("puzzle_blueprint_versions", "solvability_signature", {
        type: Sequelize.STRING(64),
        allowNull: true,
      });
    }
    if (!colunas.solvability_validated_at) {
      await queryInterface.addColumn("puzzle_blueprint_versions", "solvability_validated_at", {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("puzzle_blueprint_versions", "solvability_validated_at");
    await queryInterface.removeColumn("puzzle_blueprint_versions", "solvability_signature");
  },
};
