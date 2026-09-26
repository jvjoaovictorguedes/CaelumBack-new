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
  TAMANHO_MAXIMO_BYTES_AUDIO,
  TIPOS_ACEITOS_AUDIO,
  CATEGORIAS_VALIDAS,
  TIPOS_VALIDOS,
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

  // Reencode com compressão real (antes era só sharp(buf)[formato]().toBuffer(),
  // que reencoda nas configurações padrão do sharp — remove metadata mas
  // comprime pouco). Qualidade 82 com mozjpeg em JPEG/WEBP é o ponto onde
  // a perda visual é imperceptível pra arte de jogo (ícones/sprites/banners)
  // mas o arquivo cai bastante de tamanho; testado manualmente reencodando
  // imagens de exemplo (redução de ~35-55% vs o upload original em
  // qualidade alta, ver relatório da tarefa). PNG usa compressionLevel:9
  // (sem perda — só melhora a compressão zlib, sem "palette" pra não
  // arriscar banding em arte com gradiente).
  let bufferLimpo;
  if (formato === "gif") {
    // GIF animado: sharp só enxerga todos os frames empilhados se lido
    // com {animated:true}, e reencodar de volta pra .gif() nessas
    // condições é instável/arriscado (pode achatar pro primeiro frame
    // ou perder qualidade de paleta). Pra nunca quebrar animação, GIF
    // não é recomprimido aqui — passa os bytes originais direto (já
    // validados acima). Metadata de GIF raramente carrega EXIF pesado,
    // então não reencodar não é uma perda relevante de privacidade.
    bufferLimpo = bufferOriginal;
  } else if (formato === "png") {
    bufferLimpo = await sharp(bufferOriginal).png({ compressionLevel: 9 }).toBuffer();
  } else if (formato === "webp") {
    bufferLimpo = await sharp(bufferOriginal).webp({ quality: 82 }).toBuffer();
  } else {
    bufferLimpo = await sharp(bufferOriginal).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  }

  return { buffer: bufferLimpo, mime: mimeReal, largura: width, altura: height };
}

// Assinaturas de byte (magic numbers) dos formatos de áudio aceitos —
// sharp não lê áudio, então aqui não dá pra "reencodar" como imagem;
// só confirma que os bytes batem com o que o mimetype alega antes de
// gravar (mesmo espírito de nunca confiar cegamente no multipart).
function assinaturaBate(buffer, mimeReal) {
  if (buffer.length < 12) return false;
  if (mimeReal === "audio/mpeg") {
    // MP3: ID3v2 ("ID3") ou frame sync direto (0xFFEx/0xFFFx).
    if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) return true;
    return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
  }
  if (mimeReal === "audio/ogg") {
    return buffer.slice(0, 4).toString("ascii") === "OggS";
  }
  if (mimeReal === "audio/wav") {
    return buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WAVE";
  }
  return false;
}

const MIME_AUDIO_NORMALIZADO = {
  "audio/mpeg": "audio/mpeg",
  "audio/mp3": "audio/mpeg",
  "audio/ogg": "audio/ogg",
  "audio/wav": "audio/wav",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
};

// Áudio não passa pelo sharp (é uma lib de imagem) — valida tamanho e
// confere a assinatura de bytes contra o mimetype declarado pelo
// multipart (não dá pra "reencodar" áudio sem uma lib de codec própria,
// então os bytes originais são gravados como estão).
async function validarAudio(bufferOriginal, mimeDeclarado) {
  if (!bufferOriginal || bufferOriginal.length === 0) {
    throw erro("Nenhum arquivo enviado.");
  }
  if (bufferOriginal.length > TAMANHO_MAXIMO_BYTES_AUDIO) {
    throw erro(`O arquivo de áudio pode ter no máximo ${Math.round(TAMANHO_MAXIMO_BYTES_AUDIO / 1024 / 1024)}MB.`);
  }

  const mimeNormalizado = MIME_AUDIO_NORMALIZADO[(mimeDeclarado || "").toLowerCase()];
  if (!mimeNormalizado || !TIPOS_ACEITOS_AUDIO.includes(mimeDeclarado?.toLowerCase())) {
    throw erro(`Formato de áudio não aceito. Envie um dos seguintes: ${TIPOS_ACEITOS_AUDIO.join(", ")}.`);
  }
  if (!assinaturaBate(bufferOriginal, mimeNormalizado)) {
    throw erro("Arquivo de áudio inválido ou corrompido (os bytes não batem com o formato informado).");
  }

  return { buffer: bufferOriginal, mime: mimeNormalizado, largura: null, altura: null };
}

async function listMediaGroups({ categoria, tipo, nome, pagina = 1, porPagina = 24 } = {}) {
  const where = { ativo: true };
  if (categoria) where.categoria = categoria;
  if (tipo && TIPOS_VALIDOS.includes(tipo)) where.tipo = tipo;
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

// Só grava se vier preenchido e a categoria for "Avatar" — restrição só
// faz sentido nesse caso; um valor deixado em qualquer outra categoria
// (ex.: reenviado sem querer de um formulário genérico) seria uma
// restrição fantasma, nunca lida por ninguém, mas confusa de auditar.
async function normalizarRestricaoAvatar(categoria, restritoRacaId, restritoClasseId) {
  if (categoria !== "Avatar") return { restrito_raca_id: null, restrito_classe_id: null };
  const [Race, Class] = [require("../models/Race"), require("../models/Class")];
  if (restritoRacaId != null && !(await Race.findByPk(restritoRacaId))) {
    throw erro("restrito_raca_id não corresponde a nenhuma raça.");
  }
  if (restritoClasseId != null && !(await Class.findByPk(restritoClasseId))) {
    throw erro("restrito_classe_id não corresponde a nenhuma classe.");
  }
  return { restrito_raca_id: restritoRacaId ?? null, restrito_classe_id: restritoClasseId ?? null };
}

async function uploadMediaAsset(payload, { idAdmin, req }) {
  const { grupo, categoria, descricao, buffer, nomeArquivoOriginal, mimeDeclarado, restritoRacaId, restritoClasseId } = payload;
  const tipo = payload.tipo && TIPOS_VALIDOS.includes(payload.tipo) ? payload.tipo : "imagem";
  validarGrupo(grupo);
  if (!categoria || !CATEGORIAS_VALIDAS.includes(categoria)) {
    throw erro(`categoria precisa ser uma de: ${CATEGORIAS_VALIDAS.join(", ")}.`);
  }
  if (tipo === "audio" && categoria !== "Musica") {
    throw erro('Áudio precisa usar a categoria "Musica".');
  }
  if (tipo === "imagem" && categoria === "Musica") {
    throw erro('A categoria "Musica" é só pra arquivos de áudio.');
  }
  const { restrito_raca_id, restrito_classe_id } = await normalizarRestricaoAvatar(categoria, restritoRacaId, restritoClasseId);
  const { buffer: dados, mime, largura, altura } =
    tipo === "audio" ? await validarAudio(buffer, mimeDeclarado) : await validarEReencodarImagem(buffer);

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
        tipo,
        nome_arquivo_original: nomeArquivoOriginal ?? null,
        mime,
        tamanho_bytes: dados.length,
        largura_px: largura,
        altura_px: altura,
        dados,
        descricao: descricao ?? null,
        ativo: true,
        id_admin_criador: idAdmin,
        restrito_raca_id,
        restrito_classe_id,
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
        tipo: alvo.tipo,
        nome_arquivo_original: alvo.nome_arquivo_original,
        mime: alvo.mime,
        tamanho_bytes: alvo.tamanho_bytes,
        largura_px: alvo.largura_px,
        altura_px: alvo.altura_px,
        dados: alvo.dados,
        descricao: alvo.descricao,
        ativo: true,
        id_admin_criador: idAdmin,
        restrito_raca_id: alvo.restrito_raca_id,
        restrito_classe_id: alvo.restrito_classe_id,
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

// Extrai grupo (+ versão fixada, se houver) de uma imagem_url no
// formato /api/media/<grupo> ou /api/media/<grupo>?v=<versao> (com ou
// sem host completo na frente — resolveMediaUrl no frontend aceita
// path relativo ou URL absoluta). Qualquer imagem_url que NÃO seja
// desse formato (ex.: arte estática em /images/..., ou vazia) não é
// responsabilidade da Biblioteca de Mídia, então nunca conta como
// "quebrada" aqui.
const REGEX_GRUPO_NA_URL = /\/api\/media\/([^/?]+)(?:\?v=(\d+))?/;
function extrairGrupoEVersao(imagemUrl) {
  const match = imagemUrl?.match(REGEX_GRUPO_NA_URL);
  if (!match) return null;
  return { grupo: match[1], versaoFixada: match[2] ? Number(match[2]) : null };
}

// Diagnóstico (§ bug relatado: imagem que "funcionava antes" passou a
// dar 404 — servidor sempre respondia isso pro jogador sem NENHUM jeito
// de descobrir quais itens/poderes/monstros estavam nessa situação sem
// checar um por um). Verifica a EXISTÊNCIA REAL da versão que a
// imagem_url pede — nunca só "o grupo tem alguma versão ativa": uma
// imagem_url presa (?v=N) precisa da linha (grupo, versao=N) existir,
// não importa se é a versão ativa hoje (pinned ignora ativo, mesmo
// critério de getBytesForServing); sem ?v=, precisa existir alguma
// versão ATIVA pro grupo. Sempre devolve o que existe de verdade pra
// aquele grupo (versões e qual está ativa agora), pra decidir se é
// reapontar pra versão certa ou reenviar do zero. Nunca modifica nada,
// só lê.
async function listarReferenciasQuebradas() {
  const [Item, Power, EquipmentSet, AdventureMonster] = [
    require("../models/Item"),
    require("../models/Power"),
    require("../models/EquipmentSet"),
    require("../models/AdventureMonster"),
  ];

  const FONTES = [
    { modelo: Item, entidade: "Item", campoNome: "nome" },
    { modelo: Power, entidade: "Power", campoNome: "nome" },
    { modelo: EquipmentSet, entidade: "EquipmentSet", campoNome: "nome" },
    { modelo: AdventureMonster, entidade: "AdventureMonster", campoNome: "nome" },
  ];

  const todasAsVersoes = await MediaAsset.findAll({ attributes: ["grupo", "versao", "ativo"] });
  const versoesPorGrupo = new Map();
  for (const linha of todasAsVersoes) {
    if (!versoesPorGrupo.has(linha.grupo)) versoesPorGrupo.set(linha.grupo, []);
    versoesPorGrupo.get(linha.grupo).push({ versao: linha.versao, ativo: linha.ativo });
  }

  const quebrados = [];
  for (const { modelo, entidade, campoNome } of FONTES) {
    const linhas = await modelo.findAll({
      where: { imagem_url: { [Op.ne]: null } },
      attributes: ["id", campoNome, "imagem_url"],
    });
    for (const linha of linhas) {
      const referencia = extrairGrupoEVersao(linha.imagem_url);
      if (!referencia) continue;
      const { grupo, versaoFixada } = referencia;
      const versoesDoGrupo = versoesPorGrupo.get(grupo) ?? [];

      const existeAVersaoPedida = versaoFixada
        ? versoesDoGrupo.some((v) => v.versao === versaoFixada)
        : versoesDoGrupo.some((v) => v.ativo);
      if (existeAVersaoPedida) continue;

      const versaoAtivaAgora = versoesDoGrupo.find((v) => v.ativo)?.versao ?? null;
      quebrados.push({
        entidade,
        id: linha.id,
        nome: linha[campoNome],
        imagem_url: linha.imagem_url,
        grupo,
        versao_pedida: versaoFixada,
        // null = grupo nunca existiu (precisa reenviar do zero);
        // número = existe outra versão ativa, só a referência ficou
        // desatualizada (provável conserto: reapontar pra essa versão).
        versao_ativa_agora: versaoAtivaAgora,
        versoes_existentes: versoesDoGrupo.map((v) => v.versao).sort((a, b) => a - b),
      });
    }
  }
  return quebrados;
}

module.exports = {
  listMediaGroups,
  listGroupVersions,
  uploadMediaAsset,
  revertToVersion,
  deactivateGroup,
  getBytesForServing,
  listarReferenciasQuebradas,
};
