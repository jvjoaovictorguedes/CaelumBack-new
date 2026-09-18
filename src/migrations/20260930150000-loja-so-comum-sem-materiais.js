"use strict";

// Loja fica só com o essencial de entrada: 1 item Comum por slot/
// categoria (arma, torso, capacete, escudo, acessórios) e os
// consumíveis Comum (poção básica etc.) — pedido do usuário depois de
// notar que materiais estavam à venda. Tudo de Incomum pra cima, e
// TODO material (mesmo Comum), passa a ser só drop — regra única e
// idempotente: disponivel_loja só é true pra Comum que não seja
// Material.
module.exports = {
  async up(queryInterface) {
    const [resultado] = await queryInterface.sequelize.query(`
      UPDATE "Items"
      SET disponivel_loja = (raridade = 'Comum' AND tipo_item <> 'Material')
      WHERE disponivel_loja <> (raridade = 'Comum' AND tipo_item <> 'Material');
    `);
    console.log(`[migration] disponivel_loja ajustado em ${resultado.rowCount ?? 0} itens.`);
  },

  async down() {},
};
