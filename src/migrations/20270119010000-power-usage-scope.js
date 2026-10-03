"use strict";

// IA de Combate PvE & Habilidades de Monstros V1 (§4.1) — usage_scope é
// INDEPENDENTE de acquisition_scope (que já existe e continua dizendo
// só COMO um personagem aprende uma Power). usage_scope diz QUEM pode
// usá-la como ator de combate: CHARACTER (hoje, default seguro pra todo
// dado existente), MONSTER (só monstro, via MonsterAbility/
// GuildBossAbility/WorldBossAbility) ou BOTH. Backfill de CHARACTER pra
// tudo que já existe — nenhuma Power atual muda de comportamento.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Powers", "usage_scope", {
      type: Sequelize.ENUM("CHARACTER", "MONSTER", "BOTH"),
      allowNull: false,
      defaultValue: "CHARACTER",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Powers", "usage_scope");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Powers_usage_scope";');
  },
};
