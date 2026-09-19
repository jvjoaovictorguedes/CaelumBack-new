"use strict";

module.exports = {
  async up(queryInterface) {
    const notas = [
      {
        feature: "Meu Personagem",
        versao: "2.3",
        titulo: "Evolução de Classe agora exige caçada + dá bônus muito maior",
        descricao:
          "Cada caminho da Evolução de Classe passou a exigir também derrotar 150 vezes um monstro específico em PvE (ex.: Berserker pede 150 Minotauros), além do nível e da relíquia que já existiam. Em troca, os bônus de atributo de cada caminho praticamente dobraram — a ideia é que evoluir de classe seja um salto de poder de verdade, não só um empurrãozinho, exatamente por ser bem mais difícil de conseguir.",
      },
      {
        feature: "Combate",
        versao: "1.1",
        titulo: "Escolha qual monstro caçar na Aventura",
        descricao:
          "A tela de Aventura ganhou um seletor de \"Caçar\" — dá pra escolher um monstro específico (ex.: Minotauro) pro próximo encontro em vez de depender só do sorteio aleatório, útil pra farmar o requisito de Evolução de Classe. Só afeta o PRÓXIMO combate; o que já está em andamento continua igual.",
      },
    ];

    for (const nota of notas) {
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM patch_notes WHERE feature = :feature AND versao = :versao LIMIT 1;`,
        { replacements: { feature: nota.feature, versao: nota.versao } },
      );
      if (existente.length > 0) {
        console.log(`[migration] Nota ${nota.feature} ${nota.versao} já existe — pulando.`);
        continue;
      }

      const [[{ max }]] = await queryInterface.sequelize.query(
        `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
      );

      await queryInterface.sequelize.query(
        `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
         VALUES (:ordem, :feature, :versao, :titulo, :descricao, CURRENT_DATE, now(), now());`,
        { replacements: { ordem: max + 1, ...nota } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Meu Personagem", versao: "2.3" });
    await queryInterface.bulkDelete("patch_notes", { feature: "Combate", versao: "1.1" });
  },
};
