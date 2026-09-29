"use strict";

// Seção "Ferramentas" na Loja (bug relatado: vara de pesca não tinha
// NENHUM jeito de compra — nem seção no frontend, nem disponivel_loja
// nas duas varas reais do catálogo inicial de Pesca, que só eram
// alcançáveis via Forja). valor_compra segue a mesma proporção já usada
// nos outros itens iniciais da loja (~3x valor_venda — ver Vestes/Botas/
// Capuz de Aprendiz, Anel de Couro, Colar de Cobre).
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE "Items" SET disponivel_loja = true, valor_compra = 45
       WHERE nome = 'Vara de Bambu' AND tipo_item = 'Ferramenta';`,
    );
    await queryInterface.sequelize.query(
      `UPDATE "Items" SET disponivel_loja = true, valor_compra = 120
       WHERE nome = 'Vara Reforçada' AND tipo_item = 'Ferramenta';`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE "Items" SET disponivel_loja = false, valor_compra = 0
       WHERE nome IN ('Vara de Bambu', 'Vara Reforçada') AND tipo_item = 'Ferramenta';`,
    );
  },
};
