"use strict";

// Ícones de verdade (pixel art, craftpix.net — packs gratuitos que o
// jogador mandou) pros 5 Escudos do catálogo e pros poderes de combate
// corpo-a-corpo (Guerreiro/Anão/Orc) — até aqui só a Espada de Ferro
// tinha imagem própria, o resto caía no fallback de "inicial do nome".
// UPDATE em vez de reseed: isso já é produção com gente jogando.
module.exports = {
  async up(queryInterface) {
    const itens = [
      { nome: "Escudo de Madeira", imagem_url: "/icons/shields/escudo-madeira.png" },
      { nome: "Escudo de Ferro", imagem_url: "/icons/shields/escudo-ferro.png" },
      { nome: "Escudo do Guardião", imagem_url: "/icons/shields/escudo-guardiao.png" },
      { nome: "Bastião Inabalável", imagem_url: "/icons/shields/bastiao-inabalavel.png" },
      { nome: "Escudo do Último Baluarte", imagem_url: "/icons/shields/escudo-ultimo-baluarte.png" },
    ];
    for (const { nome, imagem_url } of itens) {
      await queryInterface.sequelize.query(
        `UPDATE "Items" SET imagem_url = :imagem_url WHERE nome = :nome;`,
        { replacements: { nome, imagem_url } },
      );
    }

    const poderes = [
      { nome: "Golpe Poderoso", imagem_url: "/icons/skills/golpe-poderoso.png" },
      { nome: "Investida Brutal", imagem_url: "/icons/skills/investida-brutal.png" },
      { nome: "Fúria de Aço", imagem_url: "/icons/skills/furia-de-aco.png" },
      { nome: "Brado de Guerra", imagem_url: "/icons/skills/brado-de-guerra.png" },
      { nome: "Golpe Sísmico", imagem_url: "/icons/skills/golpe-sismico.png" },
      { nome: "Fúria Anã", imagem_url: "/icons/skills/furia-ana.png" },
      { nome: "Fúria Selvagem", imagem_url: "/icons/skills/furia-selvagem.png" },
    ];
    for (const { nome, imagem_url } of poderes) {
      await queryInterface.sequelize.query(
        `UPDATE "Powers" SET imagem_url = :imagem_url WHERE nome = :nome;`,
        { replacements: { nome, imagem_url } },
      );
    }
  },

  async down(queryInterface) {
    const nomesItens = [
      "Escudo de Madeira",
      "Escudo de Ferro",
      "Escudo do Guardião",
      "Bastião Inabalável",
      "Escudo do Último Baluarte",
    ];
    await queryInterface.sequelize.query(
      `UPDATE "Items" SET imagem_url = NULL WHERE nome IN (:nomes);`,
      { replacements: { nomes: nomesItens } },
    );

    const nomesPoderes = [
      "Golpe Poderoso",
      "Investida Brutal",
      "Fúria de Aço",
      "Brado de Guerra",
      "Golpe Sísmico",
      "Fúria Anã",
      "Fúria Selvagem",
    ];
    await queryInterface.sequelize.query(
      `UPDATE "Powers" SET imagem_url = NULL WHERE nome IN (:nomes);`,
      { replacements: { nomes: nomesPoderes } },
    );
  },
};
