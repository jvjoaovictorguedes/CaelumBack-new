"use strict";

// Sem isso, redefinir senha (POST /users/reset-password) não invalidava
// nenhum JWT já emitido — um token roubado antes da troca continuava
// valendo até expirar sozinho. authMiddleware passa a comparar
// decoded.iat com esta coluna; null (nunca trocada por aqui) não
// rejeita nada.
module.exports = {
  async up(queryInterface, Sequelize) {
    const descricao = await queryInterface.describeTable("users");
    if ("senha_alterada_em" in descricao) {
      console.log('[migration] "users"."senha_alterada_em" já existe — pulando.');
      return;
    }

    await queryInterface.addColumn("users", "senha_alterada_em", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("users", "senha_alterada_em");
  },
};
