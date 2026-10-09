const { ESCALA_MUNDO, VERSAO_PROTOCOLO, percentualParaTile, tileParaPixel, posicaoDentroDoMundo } = require("@caelum/world-contracts");
const Territorio = require("../models/WorldTerritory");
const Node = require("../models/WorldMapNode");
const Conexao = require("../models/WorldMapConnection");
const { MAPAS } = require("./catalogo");

async function obterManifesto(estado) {
  const [territorios, pontos, conexoes] = await Promise.all([
    Territorio.findAll({ where: { ativo: true }, order: [["ordem", "ASC"]] }),
    Node.findAll({ where: { ativo: true }, order: [["ordem", "ASC"]] }),
    Conexao.findAll({ where: { ativo: true }, order: [["ordem", "ASC"]] }),
  ]);
  // Não regrava posições antigas/corrompidas numa leitura de manifesto.
  const posicao = estado.mapa_slug === "capital" && posicaoDentroDoMundo(estado.tile_x, estado.tile_y)
    ? { x: estado.tile_x, y: estado.tile_y } : percentualParaTile(50, 50);
  return {
    versao: VERSAO_PROTOCOLO, assets_versao: "v1", fase: 0, modo: "preview_cartografico",
    escala: ESCALA_MUNDO, mapa_oficial_url: "/images/map/map.webp", mapas: MAPAS,
    // Colisões, caminhos e pontos ainda exigem validação artística na Fase 1.
    geografia_validada: false, operacoes_disponiveis: [],
    posicao: { mapa_slug: "capital", tile: posicao, pixel: tileParaPixel(posicao.x, posicao.y), versao: estado.versao_posicao },
    territorios: territorios.map(t => ({ id: t.id, slug: t.slug, nome: t.nome, polygon_percentual: t.polygon_points, polygon_tile: t.polygon_points.map(p => percentualParaTile(p.x, p.y)) })),
    pontos: pontos.map(p => ({ id: p.id, nome: p.nome, tipo: p.tipo, id_territorio: p.id_territorio, percentual: { x: p.x, y: p.y }, tile: percentualParaTile(p.x, p.y) })),
    conexoes: conexoes.map(c => ({ id: c.id, id_origem: c.id_origem, id_destino: c.id_destino, tipo: c.tipo })),
  };
}
module.exports = { obterManifesto };
