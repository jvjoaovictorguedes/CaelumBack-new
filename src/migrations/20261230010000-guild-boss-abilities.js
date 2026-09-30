"use strict";

// Boss da Guilda — habilidades do chefe (pedido do dono do projeto:
// "é para ser feito igual no boss mundial, a mesma criação do boss
// mundial é para ser feita no boss da guilda"). Mesmo padrão de
// WorldBossAbility: vínculo Boss -> Power reutilizado (nunca duplica
// dano/cura/custo/cooldown aqui, isso continua em Power via id_power)
// + config de IA/alvo/telegraph específica desta luta. Sem
// fases_permitidas/escala_com_furia/custo_mana_override (Boss da
// Guilda não tem fases nem mana) e sem N_ALEATORIOS (grupo pequeno,
// TODOS já cobre o caso de AoE).
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();
    if (tabelas.includes("guild_boss_abilities")) return;

    await queryInterface.createTable("guild_boss_abilities", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_guild_boss_config: { type: Sequelize.INTEGER, allowNull: false },
      id_power: { type: Sequelize.INTEGER, allowNull: false },
      peso_uso: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      prioridade: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      tipo_alvo: {
        type: Sequelize.ENUM("ALEATORIO", "MENOR_VIDA", "TODOS"),
        allowNull: false,
        defaultValue: "ALEATORIO",
      },
      tempo_conjuracao_ms: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      // NULL = usa Power.cooldown, na mesma unidade "rodada" que o
      // turno do chefe já usa (guildBossSocket.batalha.rodada).
      cooldown_rodadas_override: { type: Sequelize.INTEGER, allowNull: true },
      ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("now()") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("now()") },
    });

    await queryInterface.addIndex("guild_boss_abilities", ["id_guild_boss_config"]);
  },

  // Postgres ENUM criado por esta migration (guild_boss_abilities
  // tipo_alvo) — dropar a tabela já remove o tipo associado, sem passo
  // extra.
  async down(queryInterface) {
    await queryInterface.dropTable("guild_boss_abilities");
  },
};
