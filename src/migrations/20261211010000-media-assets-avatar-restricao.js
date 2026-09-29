"use strict";

// Painel Administrativo — Biblioteca de Mídia ganha a categoria
// "Avatar" (imagens que o jogador pode escolher como avatar de perfil,
// ver AvatarPickerModal.tsx) + duas colunas de restrição opcional:
// restrito_raca_id/restrito_classe_id. Ambas nulas (padrão) = "liberado
// pra qualquer personagem"; preenchida = só personagens daquela
// raça/classe podem escolher (ver avatarService.js, que já aplicava a
// mesma regra pros avatares estáticos guerreiro/mago/celestial — aqui é
// a versão configurável pelo admin, sem precisar de deploy).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`ALTER TYPE "enum_media_assets_categoria" ADD VALUE IF NOT EXISTS 'Avatar';`);

    await queryInterface.addColumn("media_assets", "restrito_raca_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "Races", key: "id" },
      onDelete: "SET NULL",
    });
    await queryInterface.addColumn("media_assets", "restrito_classe_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: "Classes", key: "id" },
      onDelete: "SET NULL",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("media_assets", "restrito_classe_id");
    await queryInterface.removeColumn("media_assets", "restrito_raca_id");
    // Não dá pra remover o valor "Avatar" do enum em Postgres (ALTER
    // TYPE ... DROP VALUE não existe) — se alguma linha já usa
    // "Avatar", ela fica assim; não apaga dados no down.
  },
};
