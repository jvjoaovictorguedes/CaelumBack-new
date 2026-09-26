"use strict";

// Pedido do usuário: nenhuma zona do Modo Aventura deve ficar SEM
// background (o frontend já tinha um fallback hardcoded pra isso —
// ver o comentário de battleBackgrounds.ts admitindo "a zona nunca tem
// imagem_url vinda do servidor, sempre null" — bug real: AdventureZone.
// imagem_url nunca foi preenchido em nenhuma seed/migration). Reaproveita
// os 7 backgrounds que já existem em public/images/backgrounds/ (nenhum
// gerado agora) — o usuário vai gerar um background dedicado por zona
// depois; até lá, nenhuma fica sem imagem (algumas repetem o mesmo
// arquivo entre si, de propósito, só como placeholder temporário).
//
// Escopo deliberadamente restrito às 10 zonas REAIS do catálogo (pelo
// nome exato) — nunca um UPDATE genérico "WHERE imagem_url IS NULL" (a
// tabela também tem milhares de zonas de fixture de teste, que não
// devem ganhar background nenhum).
module.exports = {
  async up(queryInterface) {
    const MAPA = {
      "Campos dos Viajantes": "/images/backgrounds/acampamento-orc.jpg",
      "Bosque de Sussurros": "/images/backgrounds/selva-teste.jpg",
      "Pântano da Lua Morta": "/images/backgrounds/cripta-espectral.jpg",
      "Estrada dos Exilados": "/images/backgrounds/terras-devastadas.jpg",
      "Ruínas de Cinza": "/images/backgrounds/templo-ancestral-golem.jpg",
      "Terras Devastadas": "/images/backgrounds/terras-devastadas.jpg",
      "Garganta de Ferro": "/images/backgrounds/altar-cultos.jpg",
      "Cavernas Rúnicas": "/images/backgrounds/ninho-aranhas.jpg",
      "Abismo Dracônico": "/images/backgrounds/covil-minotauro.jpg",
      "Covil do Minotauro": "/images/backgrounds/covil-minotauro.jpg",
    };

    for (const [nome, imagemUrl] of Object.entries(MAPA)) {
      await queryInterface.sequelize.query(
        `UPDATE "AdventureZones" SET imagem_url = :imagemUrl
         WHERE nome = :nome AND imagem_url IS NULL;`,
        { replacements: { nome, imagemUrl } },
      );
    }
  },

  async down(queryInterface) {
    const NOMES = [
      "Campos dos Viajantes",
      "Bosque de Sussurros",
      "Pântano da Lua Morta",
      "Estrada dos Exilados",
      "Ruínas de Cinza",
      "Terras Devastadas",
      "Garganta de Ferro",
      "Cavernas Rúnicas",
      "Abismo Dracônico",
      "Covil do Minotauro",
    ];
    await queryInterface.sequelize.query(
      `UPDATE "AdventureZones" SET imagem_url = NULL WHERE nome = ANY(:nomes) AND imagem_url LIKE '/images/backgrounds/%';`,
      { replacements: { nomes: NOMES } },
    );
  },
};
