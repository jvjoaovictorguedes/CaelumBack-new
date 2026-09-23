"use strict";

// Mapeia todos os drops aos monstros da Aventura via AdventureMonsterLoots.
// Cada monstro recebe os drops definidos no mapping abaixo.
const DROPS_MONSTROS_MAPPING = [
  // Drops básicos para monstros iniciais
  { dropNome: "Presa Cinzenta", monstroNome: "Rato Gigante", chance_ppm: 400000, categoria: "Principal" },
  { dropNome: "Osso Antigo", monstroNome: "Esqueleto", chance_ppm: 350000, categoria: "Principal" },
  { dropNome: "Placa Óssea", monstroNome: "Esqueleto", chance_ppm: 250000, categoria: "Secundario" },
  { dropNome: "Orelha de Goblin", monstroNome: "Goblin", chance_ppm: 380000, categoria: "Principal" },
  { dropNome: "Pele Úmida", monstroNome: "Sapo Gigante", chance_ppm: 420000, categoria: "Principal" },
  { dropNome: "Presa de Serpente", monstroNome: "Serpente", chance_ppm: 350000, categoria: "Principal" },

  // Drops raros para monstros intermediários
  { dropNome: "Presa de Javali", monstroNome: "Javali", chance_ppm: 380000, categoria: "Principal" },
  { dropNome: "Presa do Cão de Guerra", monstroNome: "Cão de Guerra", chance_ppm: 400000, categoria: "Principal" },
  { dropNome: "Núcleo de Lodo", monstroNome: "Golem de Lodo", chance_ppm: 350000, categoria: "Principal" },
  { dropNome: "Pele Sombria", monstroNome: "Lobo Sombrio", chance_ppm: 420000, categoria: "Principal" },
  { dropNome: "Presa de Lobo Sombrio", monstroNome: "Lobo Sombrio", chance_ppm: 350000, categoria: "Secundario" },
  { dropNome: "Pelo do Alfa", monstroNome: "Lobo Alfa", chance_ppm: 430000, categoria: "Principal" },
  { dropNome: "Presa do Alfa", monstroNome: "Lobo Alfa", chance_ppm: 400000, categoria: "Secundario" },
  { dropNome: "Pena de Harpia", monstroNome: "Harpia", chance_ppm: 450000, categoria: "Principal" },
  { dropNome: "Orelha de Goblin", monstroNome: "Chefe Goblin", chance_ppm: 500000, categoria: "Principal" },

  // Drops épicos para chefes e monstros finais
  { dropNome: "Placa do Labirinto", monstroNome: "Guardião do Labirinto", chance_ppm: 600000, categoria: "Principal" },
  { dropNome: "Placa Rúnica", monstroNome: "Golem Rúnico", chance_ppm: 550000, categoria: "Principal" },
  { dropNome: "Presa de Hidra", monstroNome: "Hidra", chance_ppm: 700000, categoria: "Principal" },
  { dropNome: "Selo do Capitão", monstroNome: "Capitão Mercenário", chance_ppm: 650000, categoria: "Principal" },
  { dropNome: "Garra do Abismo", monstroNome: "Criatura do Abismo", chance_ppm: 750000, categoria: "Principal" },
  { dropNome: "Pele de Obsidiana", monstroNome: "Dragão de Obsidiana", chance_ppm: 800000, categoria: "Principal" },
  { dropNome: "Olho Petrificante", monstroNome: "Basilisco", chance_ppm: 700000, categoria: "Principal" },
  { dropNome: "Insígnia Mercenária", monstroNome: "Líder Mercenário", chance_ppm: 680000, categoria: "Principal" },

  // Drops raros diversos
  { dropNome: "Presa de Cristal", monstroNome: "Dragão de Cristal", chance_ppm: 500000, categoria: "Principal" },
  { dropNome: "Glândula Regenerativa", monstroNome: "Troll", chance_ppm: 480000, categoria: "Principal" },
  { dropNome: "Pele de Troll", monstroNome: "Troll", chance_ppm: 400000, categoria: "Secundario" },
  { dropNome: "Glândula Tóxica", monstroNome: "Escorpião Gigante", chance_ppm: 500000, categoria: "Principal" },
  { dropNome: "Glândula Ígnea", monstroNome: "Elementar de Fogo", chance_ppm: 480000, categoria: "Principal" },
  { dropNome: "Pele Queimada", monstroNome: "Elementar de Fogo", chance_ppm: 400000, categoria: "Secundario" },
  { dropNome: "Gosma Arcana", monstroNome: "Golem de Lodo Arcano", chance_ppm: 550000, categoria: "Principal" },
  { dropNome: "Núcleo Incandescente", monstroNome: "Fênix", chance_ppm: 600000, categoria: "Principal" },
  { dropNome: "Olho de Mana", monstroNome: "Orbe Viva", chance_ppm: 520000, categoria: "Principal" },
  { dropNome: "Véu Mortuário", monstroNome: "Fantasma", chance_ppm: 480000, categoria: "Principal" },

  // Drops lendários raros
  { dropNome: "Núcleo Rúnico Ancestral", monstroNome: "Golem Ancestral", chance_ppm: 900000, categoria: "Especial" },
];

module.exports = {
  async up(queryInterface) {
    for (const mapping of DROPS_MONSTROS_MAPPING) {
      const [[monstro]] = await queryInterface.sequelize.query(
        `SELECT id FROM "AdventureMonsters" WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: mapping.monstroNome } },
      );

      if (!monstro) {
        console.log(`[migration] Monstro "${mapping.monstroNome}" não encontrado — pulando drop "${mapping.dropNome}".`);
        continue;
      }

      const [[item]] = await queryInterface.sequelize.query(
        `SELECT id FROM "Items" WHERE nome = :nome AND tipo_item = 'Material' LIMIT 1;`,
        { replacements: { nome: mapping.dropNome } },
      );

      if (!item) {
        console.log(`[migration] Item "${mapping.dropNome}" não encontrado — pulando.`);
        continue;
      }

      const [[existe]] = await queryInterface.sequelize.query(
        `SELECT id FROM "AdventureMonsterLoots" WHERE id_monstro = :id_monstro AND id_item = :id_item LIMIT 1;`,
        { replacements: { id_monstro: monstro.id, id_item: item.id } },
      );

      if (existe) {
        console.log(`[migration] Drop "${mapping.dropNome}" já mapeado a "${mapping.monstroNome}" — pulando.`);
        continue;
      }

      await queryInterface.sequelize.query(
        `INSERT INTO "AdventureMonsterLoots" (id_monstro, id_item, chance_ppm, quantidade_min, quantidade_max, categoria, ativo, "createdAt", "updatedAt")
         VALUES (:id_monstro, :id_item, :chance_ppm, 1, 2, :categoria, true, now(), now());`,
        {
          replacements: {
            id_monstro: monstro.id,
            id_item: item.id,
            chance_ppm: mapping.chance_ppm,
            categoria: mapping.categoria,
          },
        },
      );

      console.log(`[migration] Drop "${mapping.dropNome}" mapeado a "${mapping.monstroNome}".`);
    }
  },

  async down(queryInterface) {
    // Não remover drops na volta, pois podem ter sido adicionados manualmente depois
    console.log("[migration] Down skipped for drop mappings.");
  },
};
