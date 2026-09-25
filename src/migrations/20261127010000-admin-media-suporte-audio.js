"use strict";

// Painel Administrativo — Biblioteca de Mídia agora aceita áudio (seção
// "Músicas") além de imagem. Duas mudanças de schema:
//  1) categoria ganha o valor "Musica" (categoria continua sendo "pra
//     que serve" — Item/Power/Monster/EquipmentSet/Outro/Musica).
//  2) coluna nova "tipo" ("imagem" | "audio") — decide qual validação
//     roda no upload (sharp+dimensão vs magic bytes de áudio) e se
//     largura_px/altura_px fazem sentido. Linhas existentes (todas
//     imagem, criadas antes de áudio existir) são preenchidas como
//     "imagem" no mesmo migration, pra nunca ficar com tipo nulo.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`ALTER TYPE "enum_media_assets_categoria" ADD VALUE IF NOT EXISTS 'Musica';`);

    await queryInterface.addColumn("media_assets", "tipo", {
      type: Sequelize.ENUM("imagem", "audio"),
      allowNull: false,
      defaultValue: "imagem",
    });

    // Redundante com o defaultValue acima (toda linha existente já é
    // preenchida como "imagem" na hora do addColumn), mas explícito pra
    // deixar claro que é um backfill intencional, não um acaso do default.
    await queryInterface.sequelize.query(`UPDATE media_assets SET tipo = 'imagem' WHERE tipo IS NULL;`);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("media_assets", "tipo");
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_media_assets_tipo";`);
    // Não dá pra remover o valor "Musica" do enum de categoria em
    // Postgres (ALTER TYPE ... DROP VALUE não existe) — se alguma linha
    // já usa "Musica", ela fica assim; não apaga dados no down.
  },
};
