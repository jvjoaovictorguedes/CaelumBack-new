"use strict";

module.exports = {
  async up(queryInterface) {
    const notas = [
      {
        feature: "Meu Personagem",
        versao: "2.8",
        titulo: "Ouro visível na sidebar",
        descricao:
          "A quantidade de ouro agora aparece direto na sidebar (perto do avatar) e na aba Status de Meu Personagem, sem precisar voltar pra tela inicial.",
      },
      {
        feature: "Combate",
        versao: "2.1",
        titulo: "Correções visuais no combate",
        descricao:
          "Corrigido o ícone de volume sobrepondo o botão de registro de combate na Aventura. Poção de mana agora mostra o próprio efeito visual (texto e borda azuis, personagem parado) em vez de avançar e atacar como se fosse um golpe.",
      },
      {
        feature: "Aventura",
        versao: "4.7",
        titulo: "Corrige ficar preso no mesmo monstro",
        descricao:
          "Sair da Aventura pelo botão da tela de vitória, logo depois de matar o monstro, não deixa mais o jogador preso no mesmo encontro ao voltar — agora sempre retorna pra seleção de área corretamente.",
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
    await queryInterface.bulkDelete("patch_notes", { feature: "Meu Personagem", versao: "2.8" });
    await queryInterface.bulkDelete("patch_notes", { feature: "Combate", versao: "2.1" });
    await queryInterface.bulkDelete("patch_notes", { feature: "Aventura", versao: "4.7" });
  },
};
