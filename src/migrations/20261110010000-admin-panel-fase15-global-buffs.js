"use strict";

// Painel Administrativo — Fase 15 "Buff Global" (permissão events.manage:
// "Buff Global e outros eventos temporais"): evento por tempo limitado
// que multiplica XP/Ouro/Drop de Aventura/XP de Expedição pra TODOS os
// jogadores (nunca por personagem/guilda — isso já existe em
// GuildBuff, sistema separado e permanente). Múltiplos buffs do MESMO
// tipo podem estar ativos ao mesmo tempo (ex.: evento de fim de semana
// + evento sazonal sobrepostos) — globalBuffService soma os percentuais
// ativos por tipo, nunca substitui um pelo outro.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("global_buffs", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      nome: { type: Sequelize.STRING(150), allowNull: false },
      tipo: {
        type: Sequelize.ENUM("Xp", "Ouro", "DropAventura", "XpExpedicao"),
        allowNull: false,
      },
      multiplicador_percentual: { type: Sequelize.INTEGER, allowNull: false },
      inicio: { type: Sequelize.DATE, allowNull: false },
      fim: { type: Sequelize.DATE, allowNull: false },
      ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      descricao: { type: Sequelize.TEXT, allowNull: true },
      id_admin_criador: { type: Sequelize.INTEGER, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
    });

    // globalBuffService.bonusesAtivosAgora roda em toda vitória de
    // combate/coleta de Expedição — consultada por (ativo, tipo, janela
    // de tempo) toda vez, então precisa de índice de verdade, não só
    // full scan (a tabela é pequena hoje, mas "pequena hoje" não é
    // garantia depois de anos de eventos acumulados).
    await queryInterface.addIndex("global_buffs", ["ativo", "tipo", "inicio", "fim"], {
      name: "global_buffs_ativo_tipo_janela_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("global_buffs");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_global_buffs_tipo";');
  },
};
