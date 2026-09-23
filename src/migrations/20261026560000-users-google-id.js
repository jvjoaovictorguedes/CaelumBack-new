"use strict";

// Login com Google (fila) — identifica de forma estável a conta Google
// vinculada a um User (o "sub" do ID token, nunca o e-mail sozinho: o
// e-mail pode, em teoria, mudar de dono do lado do Google; o sub não).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("users", "google_id", {
      type: Sequelize.STRING(255),
      allowNull: true,
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("users", "google_id");
  },
};
