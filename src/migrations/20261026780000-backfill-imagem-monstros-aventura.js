"use strict";

// Fotos dos 31 monstros novos da Expansão Aventura Beta entregues pelo
// usuário (pasta public/monstros_aventura/ no front) — nome do arquivo
// bate 1:1 com AdventureMonsters.nome. Os 9 monstros pré-existentes não
// entram aqui: usam sprite (sprite_key) em vez de foto, e nunca tiveram
// imagem_url preenchido.
const IMAGENS_POR_MONSTRO = [
  { nome: "Rato das Campinas", imagem: "/monstros_aventura/Rato das Campinas.png" },
  { nome: "Javali Selvagem", imagem: "/monstros_aventura/Javali Selvagem.png" },
  { nome: "Goblin Batedor", imagem: "/monstros_aventura/Goblin Batedor.png" },
  { nome: "Lobo Alfa da Campina", imagem: "/monstros_aventura/Lobo Alfa da Campina.png" },
  { nome: "Goblin Saqueador", imagem: "/monstros_aventura/Goblin Saqueador.png" },
  { nome: "Sapo Venenoso", imagem: "/monstros_aventura/Sapo Venenoso.png" },
  { nome: "Serpente do Brejo", imagem: "/monstros_aventura/Serpente do Brejo.png" },
  { nome: "Lodo Vivo", imagem: "/monstros_aventura/Lodo Vivo.png" },
  { nome: "Hidra Jovem", imagem: "/monstros_aventura/Hidra Jovem.png" },
  { nome: "Arqueiro Renegado", imagem: "/monstros_aventura/Arqueiro Renegado.png" },
  { nome: "Cão de Guerra", imagem: "/monstros_aventura/Cão de Guerra.png" },
  { nome: "Capitão Mercenário", imagem: "/monstros_aventura/Capitão Mercenário.png" },
  { nome: "Esqueleto Guardião", imagem: "/monstros_aventura/Esqueleto Guardião.png" },
  { nome: "Aparição Cinzenta", imagem: "/monstros_aventura/Aparição Cinzenta.png" },
  { nome: "Cavaleiro Amaldiçoado", imagem: "/monstros_aventura/Cavaleiro Amaldiçoado.png" },
  { nome: "Hiena das Cinzas", imagem: "/monstros_aventura/Hiena das Cinzas.png" },
  { nome: "Escorpião de Cinzas", imagem: "/monstros_aventura/Escorpião de Cinzas.png" },
  { nome: "Elemental de Cinzas", imagem: "/monstros_aventura/Elemental de Cinzas.png" },
  { nome: "Harpia da Garganta", imagem: "/monstros_aventura/Harpia da Garganta.png" },
  { nome: "Troll das Pedras", imagem: "/monstros_aventura/Troll das Pedras.png" },
  { nome: "Chefe Orc Sangrento", imagem: "/monstros_aventura/Chefe Orc Sangrento.png" },
  { nome: "Morcego Cristalino", imagem: "/monstros_aventura/Morcego Cristalino.png" },
  { nome: "Aranha de Pedra", imagem: "/monstros_aventura/Aranha de Pedra.png" },
  { nome: "Sentinela Rúnica", imagem: "/monstros_aventura/Sentinela Rúnica.png" },
  { nome: "Guardião Rúnico Ancestral", imagem: "/monstros_aventura/Guardião Rúnico Ancestral.png" },
  { nome: "Basilisco de Pedra", imagem: "/monstros_aventura/Basilisco de Pedra.png" },
  { nome: "Salamandra de Obsidiana", imagem: "/monstros_aventura/Salamandra de Obsidiana.png" },
  { nome: "Draco de Obsidiana", imagem: "/monstros_aventura/Draco de Obsidiana.png" },
  { nome: "Ogro do Labirinto", imagem: "/monstros_aventura/Ogro do Labirinto.png" },
  { nome: "Guardião Taurino", imagem: "/monstros_aventura/Guardião Taurino.png" },
  { nome: "Draconídeo Veterano", imagem: "/monstros_aventura/Draconídeo Veterano.png" },
];

module.exports = {
  async up(queryInterface) {
    let atualizados = 0;
    for (const { nome, imagem } of IMAGENS_POR_MONSTRO) {
      const [, affectedRows] = await queryInterface.sequelize.query(
        `UPDATE "AdventureMonsters" SET imagem_url = :imagem WHERE nome = :nome;`,
        { replacements: { nome, imagem } },
      );
      if (!affectedRows) {
        console.log(`[migration] AdventureMonster "${nome}" não encontrado — pulando.`);
        continue;
      }
      atualizados += 1;
    }
    console.log(`[migration] imagem_url aplicado em ${atualizados} AdventureMonster(s).`);
  },

  async down(queryInterface) {
    const nomes = IMAGENS_POR_MONSTRO.map((m) => m.nome);
    await queryInterface.sequelize.query(
      `UPDATE "AdventureMonsters" SET imagem_url = NULL WHERE nome IN (${nomes.map(() => "?").join(",")});`,
      { replacements: nomes },
    );
  },
};
