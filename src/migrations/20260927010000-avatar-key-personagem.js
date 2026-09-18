"use strict";

// Avatar de perfil escolhido pelo jogador (ver characterController.js —
// AVATARES_VALIDOS) — separado da ilustração automática por raça/classe
// que já existia; null significa "nunca escolheu, usa o padrão antigo".
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabela = await queryInterface.describeTable("Characters");
    if (tabela.avatar_key) {
      console.log("[migration] Characters.avatar_key já existe — pulando.");
      return;
    }
    await queryInterface.addColumn("Characters", "avatar_key", {
      type: Sequelize.STRING(30),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Characters", "avatar_key");
  },
};
