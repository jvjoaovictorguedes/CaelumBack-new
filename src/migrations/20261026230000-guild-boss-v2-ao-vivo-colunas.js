"use strict";

// Boss da Guilda V2.0 (batalha em tempo real) — só schema. Três colunas
// novas:
//   - guild_boss_contributions.numero_ataques: quantas vezes aquele
//     membro acertou o boss (dano_total já existia, mas nunca contava
//     "quantos golpes", pedido explícito do ranking novo).
//   - guild_boss_configs.dano_base_ataque: quanto o boss causa por
//     acerto na RODADA 1 do combate ao vivo (nunca existia — o boss
//     era só um saco de pancada até aqui, nunca revidava). Escala pra
//     cima a cada rodada em guildBossSocket.js (dano fraco no início,
//     crescente com o tempo, conforme pedido).
//   - guild_boss_configs.premio_maior_dano: bônus de ouro pago só pra
//     quem causou mais dano na tentativa vencida, além da recompensa
//     proporcional normal que todo mundo já recebe.
// Backfill proporcional às colunas que já existem (defesa/pool), sem
// precisar hardcodar um valor por rank — se algum admin já tiver
// ajustado defesa/pool manualmente, o backfill acompanha.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelaContribuicoes = await queryInterface.describeTable("guild_boss_contributions");
    if (!tabelaContribuicoes.numero_ataques) {
      await queryInterface.addColumn("guild_boss_contributions", "numero_ataques", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    } else {
      console.log("[migration] guild_boss_contributions.numero_ataques já existe — pulando.");
    }

    const tabelaConfigs = await queryInterface.describeTable("guild_boss_configs");
    if (!tabelaConfigs.dano_base_ataque) {
      await queryInterface.addColumn("guild_boss_configs", "dano_base_ataque", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
      await queryInterface.sequelize.query(
        `UPDATE guild_boss_configs SET dano_base_ataque = GREATEST(5, ROUND(defesa * 1.5));`,
      );
    } else {
      console.log("[migration] guild_boss_configs.dano_base_ataque já existe — pulando.");
    }

    if (!tabelaConfigs.premio_maior_dano) {
      await queryInterface.addColumn("guild_boss_configs", "premio_maior_dano", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
      await queryInterface.sequelize.query(
        `UPDATE guild_boss_configs SET premio_maior_dano = ROUND(pool_dinheiro_total * 0.15);`,
      );
    } else {
      console.log("[migration] guild_boss_configs.premio_maior_dano já existe — pulando.");
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("guild_boss_contributions", "numero_ataques").catch(() => {});
    await queryInterface.removeColumn("guild_boss_configs", "dano_base_ataque").catch(() => {});
    await queryInterface.removeColumn("guild_boss_configs", "premio_maior_dano").catch(() => {});
  },
};
