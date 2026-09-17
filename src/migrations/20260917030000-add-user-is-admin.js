"use strict";

// Suporte mínimo a papel de admin — usado pra travar os endpoints de
// dado de jogo (itens, classes, raças, poderes, propriedades) e as
// operações administrativas de inventário/habilidades atrás de
// `adminMiddleware`, em vez de deixá-los completamente abertos.
module.exports = {
  async up(queryInterface, Sequelize) {
    const descricao = await queryInterface.describeTable("users");
    if ("isAdmin" in descricao) {
      console.log('[migration] "users"."isAdmin" já existe — pulando.');
      return;
    }
    await queryInterface.addColumn("users", "isAdmin", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("users", "isAdmin");
  },
};
