"use strict";

// O nome default que o Sequelize gera pro unique index de
// GuildMemberMissionProgress (id_guild_mission_cycle + id_personagem)
// passa de 63 bytes (limite de identificador do Postgres) e é truncado
// silenciosamente na criação. `sequelize.sync()` (chamado no boot, ver
// config/database.js) recalcula o MESMO nome longo (sem truncar) pra
// checar se o índice já existe, não encontra bate porque o que está no
// Postgres é a versão truncada, e tenta criar de novo — Postgres trunca
// de novo pro mesmo nome final e recusa com "already exists", travando
// o boot num loop infinito de reconexão. Renomeia pra um nome curto e
// explícito (ver o `name:` correspondente no model) que nunca precisa
// de truncamento, então sync()/migration sempre concordam sobre o nome
// real.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER INDEX IF EXISTS guild_member_mission_progress_id_guild_mission_cycle_id_persona
      RENAME TO guild_member_mission_progress_unique;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER INDEX IF EXISTS guild_member_mission_progress_unique
      RENAME TO guild_member_mission_progress_id_guild_mission_cycle_id_persona;
    `);
  },
};
