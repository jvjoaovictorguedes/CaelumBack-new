"use strict";

// Estimador de duração de MP3 sem dependência externa (§3.2 — "duracao_ms
// extraída no servidor"). Pula um cabeçalho ID3v2 se existir, lê o
// primeiro frame MPEG válido (versão/layer/bitrate/sample rate) e
// estima a duração assumindo bitrate constante a partir dali — não é
// 100% exato pra VBR, mas é uma extração real no servidor (sem
// biblioteca de terceiros) e suficiente pro catálogo do painel.
// Retorna null se não conseguir reconhecer nenhum frame (arquivo
// corrompido/formato inesperado) — quem chama trata null como
// "duração desconhecida", nunca derruba o upload por isso.

const BITRATE_TABLE_V1_L1 = [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448];
const BITRATE_TABLE_V1_L2 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384];
const BITRATE_TABLE_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATE_TABLE_V2_L1 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256];
const BITRATE_TABLE_V2_L23 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];

const SAMPLE_RATE_V1 = [44100, 48000, 32000];
const SAMPLE_RATE_V2 = [22050, 24000, 16000];
const SAMPLE_RATE_V25 = [11025, 12000, 8000];

function tamanhoCabecalhoId3v2(buffer) {
  if (buffer.length < 10) return 0;
  if (buffer[0] !== 0x49 || buffer[1] !== 0x44 || buffer[2] !== 0x33) return 0; // "ID3"
  const tamanho =
    ((buffer[6] & 0x7f) << 21) | ((buffer[7] & 0x7f) << 14) | ((buffer[8] & 0x7f) << 7) | (buffer[9] & 0x7f);
  return 10 + tamanho;
}

function lerFrameHeader(buffer, offset) {
  if (offset + 4 > buffer.length) return null;
  if (buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) return null;

  const versaoBits = (buffer[offset + 1] >> 3) & 0x03; // 00=MPEG2.5, 10=MPEG2, 11=MPEG1
  const layerBits = (buffer[offset + 1] >> 1) & 0x03; // 01=Layer3, 10=Layer2, 11=Layer1
  const bitrateIndex = (buffer[offset + 2] >> 4) & 0x0f;
  const sampleRateIndex = (buffer[offset + 2] >> 2) & 0x03;
  const padding = (buffer[offset + 2] >> 1) & 0x01;

  if (versaoBits === 0x01 || layerBits === 0x00 || bitrateIndex === 0x0f || sampleRateIndex === 0x03) {
    return null;
  }

  let tabelaBitrate;
  let sampleRates;
  const isV1 = versaoBits === 0x03;
  sampleRates = isV1 ? SAMPLE_RATE_V1 : versaoBits === 0x02 ? SAMPLE_RATE_V2 : SAMPLE_RATE_V25;

  if (isV1 && layerBits === 0x03) tabelaBitrate = BITRATE_TABLE_V1_L1;
  else if (isV1 && layerBits === 0x02) tabelaBitrate = BITRATE_TABLE_V1_L2;
  else if (isV1 && layerBits === 0x01) tabelaBitrate = BITRATE_TABLE_V1_L3;
  else if (!isV1 && layerBits === 0x03) tabelaBitrate = BITRATE_TABLE_V2_L1;
  else tabelaBitrate = BITRATE_TABLE_V2_L23;

  const bitrateKbps = tabelaBitrate[bitrateIndex];
  const sampleRate = sampleRates[sampleRateIndex];
  if (!bitrateKbps || !sampleRate) return null;

  const framesPerSecondFactor = layerBits === 0x03 ? 12 : 144; // Layer1 vs Layer2/3
  const frameSize =
    layerBits === 0x03
      ? (Math.floor((framesPerSecondFactor * bitrateKbps * 1000) / sampleRate) + padding) * 4
      : Math.floor((framesPerSecondFactor * bitrateKbps * 1000) / sampleRate) + padding;

  return { bitrateKbps, sampleRate, frameSize };
}

function estimarDuracaoMs(buffer) {
  try {
    if (!Buffer.isBuffer(buffer) || buffer.length < 64) return null;
    let offset = tamanhoCabecalhoId3v2(buffer);
    // Procura o primeiro frame válido dentro de uma janela razoável
    // (evita loop infinito em arquivo lixo).
    const limite = Math.min(buffer.length - 4, offset + 8192);
    let frame = null;
    for (; offset <= limite; offset += 1) {
      frame = lerFrameHeader(buffer, offset);
      if (frame) break;
    }
    if (!frame) return null;

    const bytesAudio = buffer.length - offset;
    const duracaoSegundos = (bytesAudio * 8) / (frame.bitrateKbps * 1000);
    if (!Number.isFinite(duracaoSegundos) || duracaoSegundos <= 0) return null;
    return Math.round(duracaoSegundos * 1000);
  } catch {
    return null;
  }
}

module.exports = { estimarDuracaoMs };
