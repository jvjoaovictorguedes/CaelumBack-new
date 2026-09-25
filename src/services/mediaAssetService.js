// Painel Administrativo Fase 3 — Biblioteca de Mídia: upload com
// versionamento por "grupo" (slug estável). Subir de novo pro mesmo
// grupo nunca apaga a versão anterior — só desliga o ativo=true dela e
// cria uma linha nova (ver migration 20261108010000). Reaproveita sharp
// pra validar os bytes de verdade (nunca confia no mimetype que o
// multipart alega), mesmo raciocínio de guildEmblemService.js.
const sharp = require("sharp");
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const MediaAsset = require("../models/MediaAsset");
const {
  DIMENSAO_MINIMA_PX,
  DIMENSAO_MAXIMA_PX,
  TAMANHO_MAXIMO_BYTES,
  TIPOS_ACEITOS,
  CATEGORIAS_VALIDAS,
  REGEX_GRUPO_VALIDO,
} = require("../config/mediaAssetConfig");
const { registrarAcao } = require("./adminAuditService");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

function sanitizar(asset) {
  const dados = asset.toJSON();
  delete dados.dados;
  return dados;
}

function validarGrupo(grupo) {
  if (!grupo || !REGEX_GRUPO_VALIDO.test(grupo)) {
    throw erro(
      "grupo precisa ter 3-150 caracteres, só minúsculas/números/hífen/underscore, começando e terminando com letra ou número.",
    );
  }
}

// Nunca confia no mimetype alegado pelo multipart — sharp lê os bytes
// de verdade. Reencoda no mesmo formato detectado pra descartar
// metadata embutida (EXIF etc.) antes de gravar no banco.
async function validarEReencodarImagem(bufferOriginal) {
  if (!bufferOriginal || bufferOriginal.length === 0) {
    throw erro("Nenhum arquivo enviado.");
  }
  if (bufferOriginal.length > TAMANHO_MAXIMO_BYTES) {
    throw erro(`O arquivo pode ter no máximo ${Math.round(TAMANHO_MAXIMO_BYTES / 1024 / 1024)}MB.`);
  }

  let metadata;
  try {
    metadata = await sharp(bufferOriginal).metadata();
  } catch {
    throw erro("Arquivo de imagem inválido ou corrompido.");
  }

  const formato = metadata.format === "jpg" ? "jpeg" : metadata.format;
  const mimeReal = formato ? `image/${formato}` : null;
  if (!mimeReal || !TIPOS_ACEITOS.includes(mimeReal)) {
    throw erro(`Formato não aceito. Envie um dos seguintes: ${TIPOS_ACEITOS.join(", ")}.`);
  }

  const { width, height } = metadata;
  if (!width || !height) {
    throw erro("Não foi possível ler as dimensões da imagem.");
  }
  if (width < DIMENSAO_MINIMA_PX || height < DIMENSAO_MINIMA_PX) {
    throw erro(`A imagem precisa ter pelo menos ${DIMENSAO_MINIMA_PX}x${DIMENSAO_MINIMA_PX} pixels.`);
  }
  if (width > DIMENSAO_MAXIMA_PX || height > DIMENSAO_MAXIMA_PX) {
    throw erro(`A imagem pode ter no máximo ${DIMENSAO_MAXIMA_PX}x${DIMENSAO_MAXIMA_PX} pixels.`);
  }

  const bufferLimpo = await sharp(bufferOriginal)[formato]().toBuffer();
  return { buffer: bufferLimpo, mime: mimeReal, largura: width, altura: height };
}

async function listMediaGroups({ categoria, nome, pagina = 1, porPagina = 24 } = {}) {
  const where = { ativo: true };
  if (categoria) where.categoria = categoria;
  if (nome) where.grupo = { [Op.iLike]: `%${nome}%` };

  const offset = (Math.max(1, pagina) - 1) * porPagina;
  const { rows, count } = await MediaAsset.findAndCountAll({
    where,
    order: [["updatedAt", "DESC"]],
    limit: porPagina,
    offset,
  });
  return { total: count, pagina: Number(pagina), porPagina: Number(porPagina), itens: rows };
}

async function listGroupVersions(grupo) {
  validarGrupo(grupo);
  return MediaAsset.findAll({ where: { grupo }, order: [["versao", "DESC"]] });
}

async function uploadMediaAsset(payload, { idAdmin, req }) {
  const { grupo, categoria, descricao, buffer, nomeArquivoOriginal } = payload;
  validarGrupo(grupo);
  if (!categoria || !CATEGORIAS_VALIDAS.includes(categoria)) {
    throw erro(`categoria precisa ser uma de: ${CATEGORIAS_VALIDAS.join(", ")}.`);
  }
  const { buffer: dados, mime, largura, altura } = await validarEReencodarImagem(buffer);

  return sequelize.transaction(async (transaction) => {
    const atual = await MediaAsset.findOne({
      where: { grupo, ativo: true },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (atual) {
      await atual.update({ ativo: false }, { transaction });
    }

    const ultima = await MediaAsset.findOne({
      where: { grupo },
      order: [["versao", "DESC"]],
      transaction,
    });
    const novaVersao = (ultima?.versao ?? 0) + 1;

    const novo = await MediaAsset.create(
      {
        grupo,
        versao: novaVersao,
        categoria,
        nome_arquivo_original: nomeArquivoOriginal ?? null,
        mime,
        tamanho_bytes: dados.length,
        largura_px: largura,
        altura_px: altura,
        dados,
        descricao: descricao ?? null,
        ativo: true,
        id_admin_criador: idAdmin,
      },
      { transaction },
    );

    await registrarAcao({
      idAdmin,
      acao: novaVersao === 1 ? "criar" : "editar",
      entidade: "MediaAsset",
      idEntidade: novo.id,
      dadosAntes: atual ? { grupo, versaoAnterior: atual.versao } : null,
      dadosDepois: { grupo, versao: novaVersao, categoria, mime, tamanho_bytes: dados.length },
      req,
      transaction,
    });

    return sanitizar(novo);
  });
}

async function revertToVersion(grupo, versaoAlvo, { idAdmin, req }) {
  validarGrupo(grupo);
  return sequelize.transaction(async (transaction) => {
    const alvo = await MediaAsset.scope("comDados").findOne({
      where: { grupo, versao: versaoAlvo },
      transaction,
    });
    if (!alvo) throw erro("Versão não encontrada.", 404);

    const atual = await MediaAsset.findOne({
      where: { grupo, ativo: true },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (atual) await atual.update({ ativo: false }, { transaction });

    const ultima = await MediaAsset.findOne({ where: { grupo }, order: [["versao", "DESC"]], transaction });
    const novaVersao = (ultima?.versao ?? 0) + 1;

    const novo = await MediaAsset.create(
      {
        grupo,
        versao: novaVersao,
        categoria: alvo.categoria,
        nome_arquivo_original: alvo.nome_arquivo_original,
        mime: alvo.mime,
        tamanho_bytes: alvo.tamanho_bytes,
        largura_px: alvo.largura_px,
        altura_px: alvo.altura_px,
        dados: alvo.dados,
        descricao: alvo.descricao,
        ativo: true,
        id_admin_criador: idAdmin,
      },
      { transaction },
    );

    await registrarAcao({
      idAdmin,
      acao: "reverter",
      entidade: "MediaAsset",
      idEntidade: novo.id,
      dadosAntes: { grupo, versaoAtualAntes: atual?.versao ?? null },
      dadosDepois: { grupo, novaVersao, revertidoDeVersao: versaoAlvo },
      req,
      transaction,
    });

    return sanitizar(novo);
  });
}

async function deactivateGroup(grupo, { idAdmin, req }) {
  validarGrupo(grupo);
  return sequelize.transaction(async (transaction) => {
    const atual = await MediaAsset.findOne({
      where: { grupo, ativo: true },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!atual) throw erro("Esse grupo não tem versão ativa.", 404);

    await atual.update({ ativo: false }, { transaction });
    await registrarAcao({
      idAdmin,
      acao: "desativar",
      entidade: "MediaAsset",
      idEntidade: atual.id,
      dadosAntes: { grupo, versao: atual.versao },
      req,
      transaction,
    });
    return { removido: true };
  });
}

async function getBytesForServing(grupo, versaoQuery) {
  const where = { grupo };
  if (versaoQuery) {
    where.versao = versaoQuery;
  } else {
    where.ativo = true;
  }
  return MediaAsset.scope("comDados").findOne({ where, order: [["versao", "DESC"]] });
}

module.exports = {
  listMediaGroups,
  listGroupVersions,
  uploadMediaAsset,
  revertToVersion,
  deactivateGroup,
  getBytesForServing,
};
