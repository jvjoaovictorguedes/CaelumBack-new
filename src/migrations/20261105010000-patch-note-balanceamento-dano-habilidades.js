"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Combate' AND versao = '2.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Combate 2.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Combate', '2.0', 'Balanceamento: habilidades marciais agora superam o ataque básico',
         'O dano de habilidades baseadas em Força/Vitalidade/Agilidade/Velocidade (ex.: um Guerreiro usando Fúria de Aço) estava sendo calculado com o multiplicador de dano MÁGICO da classe em vez do físico — então um Guerreiro forte fisicamente tinha a própria habilidade marcial penalizada pela fraqueza mágica da classe dele, chegando a bater mais fraco que o ataque básico. Agora o multiplicador de classe usado no dano de um poder depende de como ele escala: poderes de Inteligência continuam usando o multiplicador mágico, e todo o resto (Força, Vitalidade, Agilidade, Velocidade) usa o multiplicador físico. Habilidades voltam a superar o ataque básico mesmo no nível 1, crescendo de forma mais forte quanto mais investido nelas (nível de habilidade, atributos e itens).',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Combate", versao: "2.0" });
  },
};
