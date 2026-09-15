"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.renameColumn(
      "PvpStatuses",
      "personagem_id",
      "id_personagem",
    );
  },

  async down(queryInterface) {
    await queryInterface.renameColumn(
      "PvpStatuses",
      "id_personagem",
      "personagem_id",
    );
  },
};
