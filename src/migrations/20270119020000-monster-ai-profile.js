"use strict";

// IA de Combate PvE & Habilidades de Monstros V1 (§4.4) — perfil de IA
// do monstro. BASIC (default, nenhum monstro existente ganha
// comportamento novo até o Admin configurar abilities de verdade) ->
// TACTICAL -> BOSS -> ELITE_BOSS (reservado pro Templo).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("AdventureMonsters", "ai_profile", {
      type: Sequelize.ENUM("BASIC", "TACTICAL", "BOSS", "ELITE_BOSS"),
      allowNull: false,
      defaultValue: "BASIC",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("AdventureMonsters", "ai_profile");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_AdventureMonsters_ai_profile";');
  },
};
