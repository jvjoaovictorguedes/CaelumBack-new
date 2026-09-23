// Valida e normaliza a imagem enviada pra virar emblema de guilda.
// Nunca confia no mimetype que o multipart alega — sharp lê os bytes
// de verdade pra descobrir o formato/dimensões reais (um arquivo
// renomeado pra .png não vira PNG de verdade só por causa da extensão).
const sharp = require("sharp");
const {
  DIMENSAO_FINAL_PX,
  DIMENSAO_MINIMA_PX,
  DIMENSAO_MAXIMA_PX,
  TAMANHO_MAXIMO_BYTES,
  TOLERANCIA_PROPORCAO,
  TIPOS_ACEITOS,
} = require("../config/guildEmblemConfig");

class ImagemInvalidaError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

// Devolve {buffer, mime} já normalizado (PNG quadrado de
// DIMENSAO_FINAL_PXxDIMENSAO_FINAL_PX) ou lança ImagemInvalidaError com
// uma mensagem pronta pra mostrar ao jogador.
async function validarEProcessarEmblema(bufferOriginal) {
  if (!bufferOriginal || bufferOriginal.length === 0) {
    throw new ImagemInvalidaError("Nenhuma imagem enviada.");
  }
  if (bufferOriginal.length > TAMANHO_MAXIMO_BYTES) {
    throw new ImagemInvalidaError(
      `A imagem pode ter no máximo ${Math.round(TAMANHO_MAXIMO_BYTES / 1024 / 1024)}MB.`,
    );
  }

  let metadata;
  try {
    metadata = await sharp(bufferOriginal).metadata();
  } catch {
    throw new ImagemInvalidaError("Arquivo de imagem inválido ou corrompido.");
  }

  const mimeReal = metadata.format ? `image/${metadata.format === "jpg" ? "jpeg" : metadata.format}` : null;
  if (!mimeReal || !TIPOS_ACEITOS.includes(mimeReal)) {
    throw new ImagemInvalidaError("Formato não aceito. Envie um PNG, JPEG ou WEBP.");
  }

  const { width, height } = metadata;
  if (!width || !height) {
    throw new ImagemInvalidaError("Não foi possível ler as dimensões da imagem.");
  }
  if (width < DIMENSAO_MINIMA_PX || height < DIMENSAO_MINIMA_PX) {
    throw new ImagemInvalidaError(
      `A imagem precisa ter pelo menos ${DIMENSAO_MINIMA_PX}x${DIMENSAO_MINIMA_PX} pixels.`,
    );
  }
  if (width > DIMENSAO_MAXIMA_PX || height > DIMENSAO_MAXIMA_PX) {
    throw new ImagemInvalidaError(
      `A imagem pode ter no máximo ${DIMENSAO_MAXIMA_PX}x${DIMENSAO_MAXIMA_PX} pixels.`,
    );
  }

  // "Enquadrado" (pedido explícito): a proporção precisa ser
  // essencialmente 1:1 — o jogador precisa recortar a imagem ANTES de
  // enviar, o servidor nunca corta/distorce pra disfarçar uma foto
  // retangular como se fosse quadrada.
  const proporcao = width / height;
  if (Math.abs(proporcao - 1) > TOLERANCIA_PROPORCAO) {
    throw new ImagemInvalidaError(
      `A imagem precisa ser quadrada (mesma largura e altura). Recorte a imagem antes de enviar.`,
    );
  }

  const buffer = await sharp(bufferOriginal)
    .resize(DIMENSAO_FINAL_PX, DIMENSAO_FINAL_PX, { fit: "cover" })
    .png()
    .toBuffer();

  return { buffer, mime: "image/png" };
}

module.exports = { validarEProcessarEmblema, ImagemInvalidaError };
