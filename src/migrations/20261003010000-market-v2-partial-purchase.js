"use strict";

// Mercado v2 (§4/§6/§7 da spec) — stack passa a poder ser vendido em
// partes: quantidade vira quantidade_total (renomeada) + quantidade_restante
// (decrementada a cada compra parcial), e cancelado_em fecha o par que
// já existia com vendido_em. Equipamento continua sempre 1/1.
module.exports = {
  async up(queryInterface, Sequelize) {
    const description = await queryInterface.describeTable("market_listings");

    if (!("quantidade_total" in description)) {
      await queryInterface.renameColumn("market_listings", "quantidade", "quantidade_total");
    } else {
      console.log('[migration] "market_listings"."quantidade_total" já existe — pulando rename.');
    }

    const descricaoAtualizada = await queryInterface.describeTable("market_listings");
    if (!("quantidade_restante" in descricaoAtualizada)) {
      await queryInterface.addColumn("market_listings", "quantidade_restante", {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
      // Anúncio "Ativo" começa com o restante igual ao total; "Vendido"
      // (comprado por inteiro, como só existia até aqui) fica com 0
      // restante; "Cancelado" também fica com o total (nunca foi vendido
      // nada dele, ou o resto que sobrou some junto — não tem como saber
      // quanto já tinha sido vendido antes do v2 registrar isso).
      await queryInterface.sequelize.query(`
        UPDATE market_listings SET quantidade_restante = quantidade_total WHERE status IN ('Ativo', 'Cancelado');
        UPDATE market_listings SET quantidade_restante = 0 WHERE status = 'Vendido';
      `);
      await queryInterface.changeColumn("market_listings", "quantidade_restante", {
        type: Sequelize.INTEGER,
        allowNull: false,
      });
    } else {
      console.log('[migration] "market_listings"."quantidade_restante" já existe — pulando.');
    }

    if (!("cancelado_em" in descricaoAtualizada)) {
      await queryInterface.addColumn("market_listings", "cancelado_em", {
        type: Sequelize.DATE,
        allowNull: true,
      });
    } else {
      console.log('[migration] "market_listings"."cancelado_em" já existe — pulando.');
    }
  },

  async down(queryInterface) {
    const description = await queryInterface.describeTable("market_listings");
    if ("cancelado_em" in description) {
      await queryInterface.removeColumn("market_listings", "cancelado_em");
    }
    if ("quantidade_restante" in description) {
      await queryInterface.removeColumn("market_listings", "quantidade_restante");
    }
    if ("quantidade_total" in description) {
      await queryInterface.renameColumn("market_listings", "quantidade_total", "quantidade");
    }
  },
};
