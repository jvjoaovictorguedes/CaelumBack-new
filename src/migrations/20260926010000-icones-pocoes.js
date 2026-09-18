"use strict";

// Ícones de verdade pros consumíveis — pack de poções (craftpix.net,
// mandado pelo jogador). Escolhidos por cor/estilo combinando com o
// efeito: vermelho pra vida, azul pra mana, mais ornamentado conforme
// a raridade sobe. Bandagem Improvisada fica de fora de propósito —
// não é um frasco, forçar um ícone de poção nela ficaria estranho.
module.exports = {
  async up(queryInterface) {
    const itens = [
      { nome: "Poção de Vida Pequena", imagem_url: "/icons/potions/vida-pequena.png" },
      { nome: "Poção de Vida Média", imagem_url: "/icons/potions/vida-media.png" },
      { nome: "Poção de Vida Grande", imagem_url: "/icons/potions/vida-grande.png" },
      { nome: "Poção de Mana Pequena", imagem_url: "/icons/potions/mana-pequena.png" },
      { nome: "Poção de Mana Média", imagem_url: "/icons/potions/mana-media.png" },
      { nome: "Poção de Mana Grande", imagem_url: "/icons/potions/mana-grande.png" },
      { nome: "Tônico Revigorante", imagem_url: "/icons/potions/tonico-revigorante.png" },
      { nome: "Elixir do Aventureiro", imagem_url: "/icons/potions/elixir-aventureiro.png" },
      { nome: "Poção da Fênix", imagem_url: "/icons/potions/pocao-fenix.png" },
    ];
    for (const { nome, imagem_url } of itens) {
      await queryInterface.sequelize.query(
        `UPDATE "Items" SET imagem_url = :imagem_url WHERE nome = :nome;`,
        { replacements: { nome, imagem_url } },
      );
    }
  },

  async down(queryInterface) {
    const nomes = [
      "Poção de Vida Pequena",
      "Poção de Vida Média",
      "Poção de Vida Grande",
      "Poção de Mana Pequena",
      "Poção de Mana Média",
      "Poção de Mana Grande",
      "Tônico Revigorante",
      "Elixir do Aventureiro",
      "Poção da Fênix",
    ];
    await queryInterface.sequelize.query(
      `UPDATE "Items" SET imagem_url = NULL WHERE nome IN (:nomes);`,
      { replacements: { nomes } },
    );
  },
};
