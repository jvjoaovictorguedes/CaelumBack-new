"use strict";

// Mapa Mundial v1 — passo 3/3 (spec §49, itens 6-9): os 3 Nodes de
// Aventura + 15 Nodes de Expedição (resolvidos por NOME, nunca ID fixo
// — AdventureZones/expedition_regions são seedados em migrations
// anteriores sem ID hardcoded, mesmo critério aqui), associados ao
// território certo (tabela da spec §21), mais as conexões iniciais
// (§23). Coordenadas x/y são PROVISÓRIAS (mesmo aviso da migration
// anterior) — só um layout plausível dentro do polígono de cada
// território, pra existir algo navegável antes da arte final.
const ADVENTURE_NODES = [
  { zona: "Bosque de Sussurros", territorio: "Território das Florestas", x: 10, y: 15 },
  { zona: "Covil do Minotauro", territorio: "Território das Montanhas", x: 88, y: 38 },
  { zona: "Terras Devastadas", territorio: "Território das Terras Devastadas", x: 75, y: 75 },
];

const EXPEDITION_NODES = [
  // Mineração -> Território das Montanhas
  { regiao: "Mina Abandonada", profissao: "Mineracao", territorio: "Território das Montanhas", x: 60, y: 15 },
  { regiao: "Cavernas Profundas", profissao: "Mineracao", territorio: "Território das Montanhas", x: 66, y: 22 },
  { regiao: "Galeria Arcana", profissao: "Mineracao", territorio: "Território das Montanhas", x: 72, y: 28 },
  { regiao: "Abismo Mineral", profissao: "Mineracao", territorio: "Território das Montanhas", x: 78, y: 18 },
  { regiao: "Veio Celestial", profissao: "Mineracao", territorio: "Território das Montanhas", x: 85, y: 25 },
  // Silvicultura -> Território das Florestas
  { regiao: "Bosque dos Viajantes", profissao: "Silvicultura", territorio: "Território das Florestas", x: 16, y: 22 },
  { regiao: "Floresta Antiga", profissao: "Silvicultura", territorio: "Território das Florestas", x: 22, y: 28 },
  { regiao: "Bosque Encantado", profissao: "Silvicultura", territorio: "Território das Florestas", x: 28, y: 20 },
  { regiao: "Floresta Ancestral", profissao: "Silvicultura", territorio: "Território das Florestas", x: 34, y: 30 },
  { regiao: "Bosque Celestial", profissao: "Silvicultura", territorio: "Território das Florestas", x: 38, y: 15 },
  // Exploração -> Território das Planícies Arcanas
  { regiao: "Campos Verdes", profissao: "Exploracao", territorio: "Território das Planícies Arcanas", x: 12, y: 62 },
  { regiao: "Vale Silvestre", profissao: "Exploracao", territorio: "Território das Planícies Arcanas", x: 18, y: 70 },
  { regiao: "Clareira Arcana", profissao: "Exploracao", territorio: "Território das Planícies Arcanas", x: 24, y: 78 },
  { regiao: "Terras Ancestrais", profissao: "Exploracao", territorio: "Território das Planícies Arcanas", x: 30, y: 68 },
  { regiao: "Jardim Celestial", profissao: "Exploracao", territorio: "Território das Planícies Arcanas", x: 36, y: 82 },
];

// Conexões: hub inicial (§23, Capital -> primeiro local de cada
// macro-região) + cadeia progressiva dentro de cada território, na
// ordem de nivel_minimo/nivel_monstro_min (§23: "conexões progressivas
// coerentes"). Nomes resolvidos por lookup — nunca ID fixo.
const CONEXOES = [
  ["Capital de Caelum", "Bosque de Sussurros"],
  ["Capital de Caelum", "Mina Abandonada"],
  ["Capital de Caelum", "Campos Verdes"],
  ["Capital de Caelum", "Terras Devastadas"],
  ["Bosque de Sussurros", "Bosque dos Viajantes"],
  ["Bosque dos Viajantes", "Floresta Antiga"],
  ["Floresta Antiga", "Bosque Encantado"],
  ["Bosque Encantado", "Floresta Ancestral"],
  ["Floresta Ancestral", "Bosque Celestial"],
  ["Mina Abandonada", "Cavernas Profundas"],
  ["Cavernas Profundas", "Galeria Arcana"],
  ["Galeria Arcana", "Abismo Mineral"],
  ["Abismo Mineral", "Veio Celestial"],
  ["Veio Celestial", "Covil do Minotauro"],
  ["Campos Verdes", "Vale Silvestre"],
  ["Vale Silvestre", "Clareira Arcana"],
  ["Clareira Arcana", "Terras Ancestrais"],
  ["Terras Ancestrais", "Jardim Celestial"],
];

async function idDoTerritorio(queryInterface, nome) {
  const [[row]] = await queryInterface.sequelize.query(
    `SELECT id FROM world_territories WHERE nome = :nome LIMIT 1;`,
    { replacements: { nome } },
  );
  return row?.id ?? null;
}

module.exports = {
  async up(queryInterface) {
    for (const n of ADVENTURE_NODES) {
      const [[zona]] = await queryInterface.sequelize.query(
        `SELECT id FROM "AdventureZones" WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: n.zona } },
      );
      if (!zona) {
        console.log(`[migration] AdventureZone "${n.zona}" não encontrada — pulando node.`);
        continue;
      }
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM world_map_nodes WHERE tipo = 'Adventure' AND entity_id = :entity_id LIMIT 1;`,
        { replacements: { entity_id: zona.id } },
      );
      if (existente.length > 0) {
        console.log(`[migration] Node de Aventura "${n.zona}" já existe — pulando.`);
        continue;
      }
      const idTerritorio = await idDoTerritorio(queryInterface, n.territorio);
      await queryInterface.sequelize.query(
        `INSERT INTO world_map_nodes (nome, tipo, entity_id, id_territorio, x, y, ordem, ativo, "createdAt", "updatedAt")
         VALUES (:nome, 'Adventure', :entity_id, :id_territorio, :x, :y, 0, true, now(), now());`,
        { replacements: { nome: n.zona, entity_id: zona.id, id_territorio: idTerritorio, x: n.x, y: n.y } },
      );
    }

    for (const n of EXPEDITION_NODES) {
      const [[regiao]] = await queryInterface.sequelize.query(
        `SELECT id FROM expedition_regions WHERE nome = :nome AND profissao = :profissao LIMIT 1;`,
        { replacements: { nome: n.regiao, profissao: n.profissao } },
      );
      if (!regiao) {
        console.log(`[migration] ExpeditionRegion "${n.regiao}" (${n.profissao}) não encontrada — pulando node.`);
        continue;
      }
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM world_map_nodes WHERE tipo = 'Expedition' AND entity_id = :entity_id LIMIT 1;`,
        { replacements: { entity_id: regiao.id } },
      );
      if (existente.length > 0) {
        console.log(`[migration] Node de Expedição "${n.regiao}" já existe — pulando.`);
        continue;
      }
      const idTerritorio = await idDoTerritorio(queryInterface, n.territorio);
      await queryInterface.sequelize.query(
        `INSERT INTO world_map_nodes (nome, tipo, entity_id, id_territorio, x, y, ordem, ativo, "createdAt", "updatedAt")
         VALUES (:nome, 'Expedition', :entity_id, :id_territorio, :x, :y, 0, true, now(), now());`,
        { replacements: { nome: n.regiao, entity_id: regiao.id, id_territorio: idTerritorio, x: n.x, y: n.y } },
      );
    }

    let conexoesCriadas = 0;
    for (const [origemNome, destinoNome] of CONEXOES) {
      const [[origem]] = await queryInterface.sequelize.query(
        `SELECT id FROM world_map_nodes WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: origemNome } },
      );
      const [[destino]] = await queryInterface.sequelize.query(
        `SELECT id FROM world_map_nodes WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: destinoNome } },
      );
      if (!origem || !destino) {
        console.log(`[migration] Conexão "${origemNome}" -> "${destinoNome}" pulada (node ausente).`);
        continue;
      }
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM world_map_connections WHERE id_origem = :id_origem AND id_destino = :id_destino LIMIT 1;`,
        { replacements: { id_origem: origem.id, id_destino: destino.id } },
      );
      if (existente.length > 0) continue;
      await queryInterface.sequelize.query(
        `INSERT INTO world_map_connections (id_origem, id_destino, tipo, ordem, ativo, "createdAt", "updatedAt")
         VALUES (:id_origem, :id_destino, 'Estrada', 0, true, now(), now());`,
        { replacements: { id_origem: origem.id, id_destino: destino.id } },
      );
      conexoesCriadas += 1;
    }

    console.log(
      `[migration] ${ADVENTURE_NODES.length} nodes de Aventura, ${EXPEDITION_NODES.length} nodes de Expedição e ${conexoesCriadas} conexões processados.`,
    );
  },

  async down(queryInterface) {
    const nomes = [
      ...ADVENTURE_NODES.map((n) => n.zona),
      ...EXPEDITION_NODES.map((n) => n.regiao),
    ];
    const [nodes] = await queryInterface.sequelize.query(
      `SELECT id FROM world_map_nodes WHERE nome IN (:nomes);`,
      { replacements: { nomes } },
    );
    const idsNodes = nodes.map((n) => n.id);
    if (idsNodes.length > 0) {
      await queryInterface.sequelize.query(
        `DELETE FROM world_map_connections WHERE id_origem IN (:ids) OR id_destino IN (:ids);`,
        { replacements: { ids: idsNodes } },
      );
      await queryInterface.sequelize.query(`DELETE FROM world_map_nodes WHERE id IN (:ids);`, {
        replacements: { ids: idsNodes },
      });
    }
    // Conexões que partem/chegam na Capital e não envolvem os nodes
    // acima (ex.: Capital -> Bosque de Sussurros) também somem junto,
    // já cobertas pela query acima (Bosque de Sussurros está em
    // idsNodes). Nada mais a limpar.
  },
};
