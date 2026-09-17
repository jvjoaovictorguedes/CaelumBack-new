"use strict";

// Poder nunca teve imagem própria — a aba de Habilidades do front só
// mostrava um badge com a inicial do nome. Mesmo padrão de Items.imagem_url
// (STRING nullable, aceita tanto um caminho local em /public — "/images/..."
// — quanto uma URL http(s) qualquer, resolvida no front via resolveMediaUrl).
module.exports = {
  async up(queryInterface, Sequelize) {
    const descricao = await queryInterface.describeTable("Powers");
    if ("imagem_url" in descricao) {
      console.log('[migration] "Powers"."imagem_url" já existe — pulando.');
      return;
    }

    await queryInterface.addColumn("Powers", "imagem_url", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Powers", "imagem_url");
  },
};
