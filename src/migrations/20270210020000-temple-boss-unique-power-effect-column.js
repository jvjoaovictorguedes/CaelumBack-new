"use strict";

// Templo do Véu Celestial — Fase 5. "TEMPLE_BOSS" é um contexto de
// combate NOVO (combatContextConfig.CONTEXTOS_DE_COMBATE) e dois
// sistemas de política por contexto já existentes checam a lista de
// contextos ANTES de olhar o personagem: uniquePowerEffectRegistry
// (Proezas Únicas) e combatModifierService (PowerCombatEffect — passivas/
// gatilhos de Habilidades V2.0). Sem as colunas allow_temple_boss, os
// dois travariam com erro 500 pra QUALQUER personagem com um Power
// desses tipos ao entrar na luta do Guardião. Default true, mesmo
// critério de allow_guild_boss/allow_world_boss: Legado/passivas
// funcionam em todo PvE/Boss coletivo por padrão, só PvP competitivo
// nasce bloqueado.
async function adicionarColuna(queryInterface, Sequelize, tabela) {
  const colunas = await queryInterface.describeTable(tabela);
  if (!colunas.allow_temple_boss) {
    await queryInterface.addColumn(tabela, "allow_temple_boss", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  }
}

async function removerColuna(queryInterface, tabela) {
  const colunas = await queryInterface.describeTable(tabela);
  if (colunas.allow_temple_boss) {
    await queryInterface.removeColumn(tabela, "allow_temple_boss");
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await adicionarColuna(queryInterface, Sequelize, "unique_power_effects");
    await adicionarColuna(queryInterface, Sequelize, "power_combat_effects");
  },

  async down(queryInterface) {
    await removerColuna(queryInterface, "power_combat_effects");
    await removerColuna(queryInterface, "unique_power_effects");
  },
};
