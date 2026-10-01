"use strict";

// Poção de Reset de Atributos — novo efeito de consumível que devolve
// todo ponto livre já distribuído pro personagem redistribuir, sem
// nunca deixar um atributo abaixo do bônus BASE da raça (attributeService
// .resetarAtributos). Item em si é cadastrado normalmente pelo Painel de
// Itens (tipo_item "Consumivel"), só o flag de efeito nasce aqui.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("consumable_properties", "efeito_reset_atributos", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("consumable_properties", "efeito_reset_atributos");
  },
};
