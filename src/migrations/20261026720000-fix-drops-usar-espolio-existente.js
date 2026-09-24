"use strict";

// Corrige as migrations 20261026500000/20261026510000: elas criaram 33
// Items novos do tipo "Material" e os mapearam via AdventureMonsterLoot,
// sem checar que o jogo JÁ tinha um catálogo de Espólio completo e
// testado (1 entrada por monstro, exatamente 2 pra Comum / 3 pra Raro —
// ver test/aventuraExpansao.test.js) com itens quase idênticos (ex.:
// "Presa de Cão de Guerra" já existia; a migration criou uma segunda
// "Presa do Cão de Guerra"). Isso duplicou conteúdo e quebrou a
// contagem fixa de loot por monstro.
//
// Este fix:
//   1) remove os AdventureMonsterLoots das migrations anteriores
//   2) remove os 33 Items "Material" duplicados
//   3) aplica a imagem (entregue pelo usuário, nomeada pelos 33 drops)
//      nos Items "Espolio" ORIGINAIS correspondentes — sem criar nada novo
const NOMES_ITENS_MATERIAL_DUPLICADOS = [
  "Pele Sombria", "Pele Úmida", "Pelo do Alfa", "Pena de Harpia", "Placa do Labirinto",
  "Placa Rúnica", "Placa Óssea", "Presa Cinzenta", "Presa de Cristal", "Presa de Hidra",
  "Presa de Javali", "Presa de Lobo Sombrio", "Presa de Serpente", "Presa do Alfa",
  "Presa do Cão de Guerra", "Selo do Capitão", "Véu Mortuário", "Garra do Abismo",
  "Glândula Regenerativa", "Glândula Tóxica", "Glândula Ígnea", "Gosma Arcana",
  "Insígnia Mercenária", "Núcleo de Lodo", "Núcleo Incandescente", "Núcleo Rúnico Ancestral",
  "Olho de Mana", "Olho Petrificante", "Orelha de Goblin", "Osso Antigo",
  "Pele de Obsidiana", "Pele de Troll", "Pele Queimada",
];

// { nomeItemEspolioExistente, imagem } — mapeia o Item "Espolio" já
// existente pra imagem entregue (arquivo nomeado pelo drop original;
// 3 nomes de arquivo não batem 1:1 com o nome do Item real — mapeados
// abaixo pro nome correto).
const IMAGENS_POR_ITEM_ESPOLIO = [
  { nome: "Garra do Abismo", imagem: "/images/drops/Garra do Abismo.png" },
  { nome: "Gelatina Arcana", imagem: "/images/drops/Gosma Arcana.png" },
  { nome: "Olho Petrificante", imagem: "/images/drops/Olho Petrificante.png" },
  { nome: "Olho de Mana", imagem: "/images/drops/Olho de Mana.png" },
  { nome: "Orelha de Goblin", imagem: "/images/drops/Orelha de Goblin.png" },
  { nome: "Osso Antigo", imagem: "/images/drops/Osso Antigo.png" },
  { nome: "Pele Queimada", imagem: "/images/drops/Pele Queimada.png" },
  { nome: "Pele Sombria", imagem: "/images/drops/Pele Sombria.png" },
  { nome: "Pele de Obsidiana", imagem: "/images/drops/Pele de Obsidiana.png" },
  { nome: "Pele de Troll", imagem: "/images/drops/Pele de Troll.png" },
  { nome: "Pele do Alfa", imagem: "/images/drops/Pelo do Alfa.png" },
  { nome: "Pena de Harpia", imagem: "/images/drops/Pena de Harpia.png" },
  { nome: "Placa do Labirinto", imagem: "/images/drops/Placa do Labirinto.png" },
  { nome: "Presa Cinzenta", imagem: "/images/drops/Presa Cinzenta.png" },
  { nome: "Presa de Cristal", imagem: "/images/drops/Presa de Cristal.png" },
  { nome: "Presa de Hidra", imagem: "/images/drops/Presa de Hidra.png" },
  { nome: "Presa de Javali", imagem: "/images/drops/Presa de Javali.png" },
  { nome: "Presa de Lobo Sombrio", imagem: "/images/drops/Presa de Lobo Sombrio.png" },
  { nome: "Presa de Serpente", imagem: "/images/drops/Presa de Serpente.png" },
  { nome: "Presa do Alfa", imagem: "/images/drops/Presa do Alfa.png" },
];

module.exports = {
  async up(queryInterface) {
    // 1) IDs dos Items "Material" duplicados.
    const [duplicados] = await queryInterface.sequelize.query(
      `SELECT id FROM "Items" WHERE tipo_item = 'Material' AND nome IN (${NOMES_ITENS_MATERIAL_DUPLICADOS.map(() => "?").join(",")});`,
      { replacements: NOMES_ITENS_MATERIAL_DUPLICADOS },
    );
    const idsDuplicados = duplicados.map((d) => d.id);

    if (idsDuplicados.length > 0) {
      await queryInterface.sequelize.query(`DELETE FROM "AdventureMonsterLoots" WHERE id_item IN (${idsDuplicados.join(",")});`);
      await queryInterface.sequelize.query(`DELETE FROM "Items" WHERE id IN (${idsDuplicados.join(",")});`);
      console.log(`[migration] ${idsDuplicados.length} item(ns) "Material" duplicado(s) removido(s), junto com seus AdventureMonsterLoots.`);
    } else {
      console.log("[migration] Nenhum item Material duplicado encontrado — já corrigido antes.");
    }

    // 2) Backfill de imagem nos Items "Espolio" reais.
    for (const { nome, imagem } of IMAGENS_POR_ITEM_ESPOLIO) {
      const [[item]] = await queryInterface.sequelize.query(
        `SELECT id FROM "Items" WHERE nome = :nome AND tipo_item = 'Espolio' LIMIT 1;`,
        { replacements: { nome } },
      );
      if (!item) {
        console.log(`[migration] Item Espólio "${nome}" não encontrado — pulando imagem.`);
        continue;
      }
      await queryInterface.sequelize.query(
        `UPDATE "Items" SET imagem_url = :imagem WHERE id = :id;`,
        { replacements: { id: item.id, imagem } },
      );
    }
    console.log(`[migration] Imagem aplicada em ${IMAGENS_POR_ITEM_ESPOLIO.length} Item(ns) Espólio existente(s).`);
  },

  async down(queryInterface) {
    const nomes = IMAGENS_POR_ITEM_ESPOLIO.map((i) => i.nome);
    await queryInterface.sequelize.query(
      `UPDATE "Items" SET imagem_url = NULL WHERE nome IN (${nomes.map(() => "?").join(",")}) AND tipo_item = 'Espolio';`,
      { replacements: nomes },
    );
    // Não recria os 33 Items "Material" removidos — eram duplicatas indevidas.
  },
};
