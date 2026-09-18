"use strict";

module.exports = {
  async up(queryInterface) {
    const notas = [
      {
        feature: "Meu Personagem",
        versao: "2.2",
        titulo: "Evolução de Classe virou uma árvore de 3 caminhos",
        descricao:
          "Antes cada classe tinha só 1 evolução fixa. Agora Guerreiro e Mago têm 3 caminhos exclusivos pra escolher no nível 40 — Guerreiro: Berserker (dano puro), Paladino (resistência) ou Cavaleiro Real (equilíbrio); Mago: Arquimago Eterno (dano arcano), Nigromante (sustentação) ou Feiticeiro Arcano (velocidade). Cada caminho pede sua própria Relíquia de Ascensão e dá um bônus permanente de atributos diferente. A escolha continua sendo definitiva — sem trocar de caminho depois.",
      },
      {
        feature: "Expedição",
        versao: "1.4",
        titulo: "Cooldown de coleta agora é global entre as 3 profissões",
        descricao:
          "Coletar em qualquer profissão (Mineração, Silvicultura ou Exploração) agora trava as outras duas pelo mesmo tempo — antes cada profissão tinha cooldown independente, permitindo coletar em duas ao mesmo tempo.",
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
    await queryInterface.bulkDelete("patch_notes", { feature: "Meu Personagem", versao: "2.2" });
    await queryInterface.bulkDelete("patch_notes", { feature: "Expedição", versao: "1.4" });
  },
};
