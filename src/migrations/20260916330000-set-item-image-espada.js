"use strict";

// Preenche imagem_url da "Espada de Ferro" (id 2, ver seed-items.js) com o
// ícone que já está em public/images/sword-basic.webp no front. O seed de
// Items só roda uma vez (pula se a tabela já tiver dados), então em
// produção precisa desse UPDATE avulso pra pegar quem já foi seedado antes
// da coluna ter um valor.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE "Items" SET imagem_url = '/images/sword-basic.webp' WHERE id = 2 AND imagem_url IS NULL;`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE "Items" SET imagem_url = NULL WHERE id = 2;`,
    );
  },
};
