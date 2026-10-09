"use strict";

// Fonte única da escala. Front e Back consomem a mesma versão deste pacote.
const ESCALA_MUNDO = Object.freeze({ largura_tiles: 400, altura_tiles: 180, tile_px: 32, chunk_tiles: 32 });
const EVENTOS_MUNDO = Object.freeze({ ENTRAR: "world:join", SAIR: "world:leave", MOVER: "world:move", INTERAGIR: "world:interact", CONJURAR: "world:cast", SNAPSHOT: "world:snapshot", ERRO: "world:error" });
const VERSAO_PROTOCOLO = 1;
function numeroValido(valor) {
  if (typeof valor !== "number" || !Number.isFinite(valor)) throw new TypeError("Coordenada deve ser um número finito.");
  return valor;
}
function percentualParaTile(x, y) {
  numeroValido(x); numeroValido(y);
  if (x < 0 || x > 100 || y < 0 || y > 100) throw new RangeError("Percentual fora do mapa.");
  return { x: x * ESCALA_MUNDO.largura_tiles / 100, y: y * ESCALA_MUNDO.altura_tiles / 100 };
}
function tileParaPercentual(x, y) {
  numeroValido(x); numeroValido(y);
  if (x < 0 || x > ESCALA_MUNDO.largura_tiles || y < 0 || y > ESCALA_MUNDO.altura_tiles) throw new RangeError("Tile fora do mapa.");
  return { x: x * 100 / ESCALA_MUNDO.largura_tiles, y: y * 100 / ESCALA_MUNDO.altura_tiles };
}
function tileParaPixel(x, y) { numeroValido(x); numeroValido(y); return { x: x * ESCALA_MUNDO.tile_px, y: y * ESCALA_MUNDO.tile_px }; }
function posicaoDentroDoMundo(x, y) {
  return typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)
    && x >= 0 && y >= 0 && x < ESCALA_MUNDO.largura_tiles && y < ESCALA_MUNDO.altura_tiles;
}
function chunkDaPosicao(x, y) {
  if (!posicaoDentroDoMundo(x, y)) throw new RangeError("Posição fora do mundo.");
  return { x: Math.floor(x / ESCALA_MUNDO.chunk_tiles), y: Math.floor(y / ESCALA_MUNDO.chunk_tiles) };
}
// Retorna só chunks que cruzam a câmera + margem; evita carregar o mundo inteiro.
function chunksVisiveis({ x, y, largura, altura }, margem = 1) {
  for (const v of [x, y, largura, altura, margem]) numeroValido(v);
  if (largura <= 0 || altura <= 0 || !Number.isInteger(margem) || margem < 0 || margem > 2) throw new RangeError("Viewport inválida.");
  const passo = ESCALA_MUNDO.chunk_tiles * ESCALA_MUNDO.tile_px;
  const maxX = Math.ceil(ESCALA_MUNDO.largura_tiles / ESCALA_MUNDO.chunk_tiles) - 1;
  const maxY = Math.ceil(ESCALA_MUNDO.altura_tiles / ESCALA_MUNDO.chunk_tiles) - 1;
  const resultado = [];
  if (x + largura <= 0 || y + altura <= 0 || x >= ESCALA_MUNDO.largura_tiles * ESCALA_MUNDO.tile_px || y >= ESCALA_MUNDO.altura_tiles * ESCALA_MUNDO.tile_px) return resultado;
  for (let cy = Math.max(0, Math.floor(y / passo) - margem); cy <= Math.min(maxY, Math.ceil((y + altura) / passo) - 1 + margem); cy++) {
    for (let cx = Math.max(0, Math.floor(x / passo) - margem); cx <= Math.min(maxX, Math.ceil((x + largura) / passo) - 1 + margem); cx++) resultado.push({ x: cx, y: cy });
  }
  return resultado;
}
module.exports = { ESCALA_MUNDO, EVENTOS_MUNDO, VERSAO_PROTOCOLO, percentualParaTile, tileParaPercentual, tileParaPixel, posicaoDentroDoMundo, chunkDaPosicao, chunksVisiveis };
