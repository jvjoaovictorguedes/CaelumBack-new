"use strict";

// Mapa Mundial v1 — passo 2/3 (spec §49, itens 4-5): seed dos 4
// territórios e da Capital/HUB neutro.
//
// Coordenadas/polígonos são PROVISÓRIAS de propósito (spec §49: "As
// coordenadas exatas x/y e polygon_points devem ser definidas depois
// que a arte final do mapa estiver disponível. Não inventar
// coordenadas definitivas antes da arte") — um layout de 4 quadrantes
// simples, só pra a arquitetura funcionar ponta a ponta antes de
// existir arte real (`mapa-caelum.webp`, ver §24). Reposicionar aqui é
// seguro: nada além deste seed depende dos valores exatos.
module.exports = {
  async up(queryInterface) {
    const territorios = [
      {
        nome: "Território das Florestas",
        slug: "florestas",
        descricao: "Bosques, florestas e madeira — lar do Bosque de Sussurros e das regiões de Silvicultura.",
        polygon_points: JSON.stringify([
          { x: 5, y: 8 }, { x: 42, y: 5 }, { x: 46, y: 38 }, { x: 28, y: 46 }, { x: 6, y: 40 },
        ]),
        label_x: 24, label_y: 22, ordem: 1,
      },
      {
        nome: "Território das Montanhas",
        slug: "montanhas",
        descricao: "Minas, cavernas e serras — lar do Covil do Minotauro e das regiões de Mineração.",
        polygon_points: JSON.stringify([
          { x: 54, y: 5 }, { x: 95, y: 8 }, { x: 94, y: 42 }, { x: 72, y: 46 }, { x: 56, y: 38 },
        ]),
        label_x: 75, label_y: 22, ordem: 2,
      },
      {
        nome: "Território das Planícies Arcanas",
        slug: "planicies-arcanas",
        descricao: "Campos, vales e zonas de exploração — lar das regiões de Exploração.",
        polygon_points: JSON.stringify([
          { x: 6, y: 56 }, { x: 28, y: 52 }, { x: 46, y: 60 }, { x: 42, y: 94 }, { x: 5, y: 92 },
        ]),
        label_x: 24, label_y: 74, ordem: 3,
      },
      {
        nome: "Território das Terras Devastadas",
        slug: "terras-devastadas",
        descricao: "Campos queimados, ruínas e perigo — lar das Terras Devastadas.",
        polygon_points: JSON.stringify([
          { x: 56, y: 58 }, { x: 72, y: 52 }, { x: 94, y: 56 }, { x: 95, y: 92 }, { x: 58, y: 94 },
        ]),
        label_x: 75, label_y: 74, ordem: 4,
      },
    ];

    for (const t of territorios) {
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM world_territories WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: t.nome } },
      );
      if (existente.length > 0) {
        console.log(`[migration] Território "${t.nome}" já existe — pulando.`);
        continue;
      }
      await queryInterface.sequelize.query(
        `INSERT INTO world_territories (nome, slug, descricao, polygon_points, label_x, label_y, ordem, ativo, controle_habilitado, "createdAt", "updatedAt")
         VALUES (:nome, :slug, :descricao, :polygon_points, :label_x, :label_y, :ordem, true, false, now(), now());`,
        { replacements: t },
      );
    }

    // Capital de Caelum — zona neutra permanente (id_territorio null,
    // spec §9), único Node de tipo City nesta versão: os 6 serviços
    // (§8) ficam em `metadata.services`, chaves allowlisted resolvidas
    // pra rota pelo worldMapService, NUNCA uma rota crua vinda do banco
    // (§20/§50). Ficam de fora do mapa como pins próprios de propósito
    // — a spec pede um painel com botões ao clicar na Capital, não 6
    // pins extras poluindo o mapa perto dela.
    const [capitalExistente] = await queryInterface.sequelize.query(
      `SELECT id FROM world_map_nodes WHERE nome = 'Capital de Caelum' LIMIT 1;`,
    );
    if (capitalExistente.length > 0) {
      console.log('[migration] Node "Capital de Caelum" já existe — pulando.');
      return;
    }

    await queryInterface.sequelize.query(
      `INSERT INTO world_map_nodes (nome, tipo, entity_id, id_territorio, x, y, ordem, ativo, metadata, "createdAt", "updatedAt")
       VALUES ('Capital de Caelum', 'City', NULL, NULL, 50, 50, 0, true, :metadata, now(), now());`,
      { replacements: { metadata: JSON.stringify({ services: ["SHOP", "MARKET", "FORGE", "GUILDS", "QUESTS", "PVP"] }) } },
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DELETE FROM world_map_nodes WHERE nome = 'Capital de Caelum';`);
    await queryInterface.sequelize.query(
      `DELETE FROM world_territories WHERE nome IN (
        'Território das Florestas', 'Território das Montanhas',
        'Território das Planícies Arcanas', 'Território das Terras Devastadas'
      );`,
    );
  },
};
