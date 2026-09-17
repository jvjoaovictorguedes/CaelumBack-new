"use strict";

// Fluxo de "esqueci minha senha": nunca guarda o token em texto puro no
// banco (se o banco vazar, o token vazou junto e qualquer um reseta a
// senha de qualquer um) — só o HASH (sha256) do token que foi mandado
// por e-mail. reset_password_expires limita a janela de uso (30min,
// ver authService/userController) mesmo que o hash vaze de outro jeito.
module.exports = {
  async up(queryInterface, Sequelize) {
    const descricao = await queryInterface.describeTable("users");

    if (!("reset_password_token_hash" in descricao)) {
      await queryInterface.addColumn("users", "reset_password_token_hash", {
        type: Sequelize.STRING(255),
        allowNull: true,
      });
    }

    if (!("reset_password_expires" in descricao)) {
      await queryInterface.addColumn("users", "reset_password_expires", {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("users", "reset_password_token_hash");
    await queryInterface.removeColumn("users", "reset_password_expires");
  },
};
