"use strict";

// Fila: upload de emblema de guilda. Guarda a imagem em BYTEA no
// próprio banco (não em disco local nem serviço externo) — o backend
// roda `migrate && node app.js` num host sem garantia de disco
// persistente entre deploys, então qualquer coisa salva em disco local
// desapareceria no próximo deploy. emblema_url (já existente) passa a
// apontar pro endpoint próprio (GET /guilds/:id/emblem) depois de um
// upload, em vez de aceitar qualquer URL arbitrária.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Guilds", "emblema_imagem", {
      type: Sequelize.BLOB,
      allowNull: true,
    });
    await queryInterface.addColumn("Guilds", "emblema_mime", {
      type: Sequelize.STRING(50),
      allowNull: true,
    });
    // Cache-busting da URL pública (?v=<timestamp>) — sem isso, o
    // navegador (ou um CDN na frente) podia continuar servindo o
    // emblema antigo depois de uma troca, já que a URL em si não muda.
    await queryInterface.addColumn("Guilds", "emblema_atualizado_em", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Guilds", "emblema_atualizado_em");
    await queryInterface.removeColumn("Guilds", "emblema_mime");
    await queryInterface.removeColumn("Guilds", "emblema_imagem");
  },
};
