"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Combate' AND versao = '2.2' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Combate 2.2 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Combate', '2.2', 'Habilidade que rouba vida (Ciclo Vital) não cura mais quando o golpe erra',
         'Habilidades que causam dano E curam ao mesmo tempo (como Ciclo Vital) estavam curando mesmo quando o alvo esquivava do ataque — sem fazer sentido nenhum, já que não tinha dano nenhum pra "roubar". Agora a cura só acontece quando o golpe realmente acerta, tanto na Aventura quanto no Duelo.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Combate", versao: "2.2" });
  },
};
