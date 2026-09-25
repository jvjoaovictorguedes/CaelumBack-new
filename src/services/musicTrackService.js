"use strict";

// Painel Administrativo de Músicas §6/§11.3 — CRUD de MusicTrack e
// versionamento do arquivo físico (upload nunca sobrescreve, ativar
// versão exige music.publish e auditoria, reverter só troca qual
// versão é a corrente, nunca apaga histórico).
const crypto = require("crypto");
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const MusicTrack = require("../models/MusicTrack");
const MusicTrackFileVersion = require("../models/MusicTrackFileVersion");
const MusicAssignment = require("../models/MusicAssignment");
const MusicPoolTrackAssignment = require("../models/MusicPoolTrackAssignment");
const MusicConfigVersion = require("../models/MusicConfigVersion");
const { registrarAcao } = require("./adminAuditService");
const { estimarDuracaoMs } = require("../utils/mp3Duration");
const { TAMANHO_MAXIMO_BYTES, TIPOS_ACEITOS, REGEX_KEY_VALIDA } = require("../config/musicTrackConfig");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

// Mesmo raciocínio de assinaturaBate em mediaAssetService.js — nunca
// confia cegamente no mimetype declarado pelo multipart.
function mimeRealDeBytes(buffer) {
  if (!buffer || buffer.length < 4) return null;
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) return "audio/mpeg"; // ID3v2
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return "audio/mpeg"; // frame sync
  if (buffer.slice(0, 4).toString("ascii") === "OggS") return "audio/ogg";
  return null;
}

function validarKey(key) {
  if (!key || !REGEX_KEY_VALIDA.test(key)) {
    throw erro("key precisa ser lowercase, com números/hífen/underscore, entre 3 e 80 caracteres.");
  }
}

async function listarTracks({ nome, ativo } = {}) {
  const where = {};
  if (typeof ativo === "boolean") where.ativo = ativo;
  if (nome) where[Op.or] = [{ nome: { [Op.iLike]: `%${nome}%` } }, { key: { [Op.iLike]: `%${nome}%` } }];
  const tracks = await MusicTrack.findAll({ where, order: [["nome", "ASC"]] });

  const ids = tracks.map((t) => t.id);
  const versoesAtivas = ids.length
    ? await MusicTrackFileVersion.findAll({ where: { id_track: ids, ativo: true } })
    : [];
  const versaoPorTrack = new Map(versoesAtivas.map((v) => [v.id_track, v]));

  return tracks.map((t) => ({
    ...t.toJSON(),
    versaoAtual: versaoPorTrack.get(t.id)
      ? {
          versao: versaoPorTrack.get(t.id).versao,
          duracao_ms: versaoPorTrack.get(t.id).duracao_ms,
          tamanho_bytes: versaoPorTrack.get(t.id).tamanho_bytes,
        }
      : null,
  }));
}

async function obterTrackPorId(id) {
  const track = await MusicTrack.findByPk(id);
  if (!track) throw erro("Faixa não encontrada.", 404);
  return track;
}

async function obterTrackPorKey(key) {
  const track = await MusicTrack.findOne({ where: { key } });
  if (!track) throw erro("Faixa não encontrada.", 404);
  return track;
}

async function criarTrack({ key, nome, descricao, loop, default_volume }, { idAdmin, req }) {
  validarKey(key);
  if (!nome) throw erro("nome é obrigatório.");
  if (default_volume != null && (default_volume < 0 || default_volume > 1)) {
    throw erro("default_volume precisa estar entre 0 e 1.");
  }
  const existente = await MusicTrack.findOne({ where: { key } });
  if (existente) throw erro("Já existe uma faixa com essa key.", 409);

  const track = await MusicTrack.create({
    key,
    nome,
    descricao: descricao ?? null,
    loop: loop ?? true,
    default_volume: default_volume ?? null,
    ativo: true,
  });

  await registrarAcao({
    idAdmin,
    acao: "MUSIC_TRACK_CREATE",
    entidade: "MusicTrack",
    idEntidade: track.id,
    dadosAntes: null,
    dadosDepois: track.toJSON(),
    req,
  });
  return track;
}

async function atualizarTrack(id, patch, { idAdmin, req }) {
  const track = await obterTrackPorId(id);
  const antes = track.toJSON();

  // key só pode mudar se a track ainda não foi usada em nenhuma
  // configuração publicada/histórica (§6.2 — "bloqueada depois de
  // publicada/usada, salvo operação administrativa especial").
  if (patch.key && patch.key !== track.key) {
    validarKey(patch.key);
    const usoHistorico = await MusicAssignment.count({ where: { id_track: track.id } });
    if (usoHistorico > 0) {
      throw erro("Essa faixa já foi usada em alguma configuração publicada — a key está bloqueada.", 409);
    }
    const emUso = await MusicTrack.findOne({ where: { key: patch.key } });
    if (emUso) throw erro("Já existe uma faixa com essa key.", 409);
    track.key = patch.key;
  }
  if (patch.nome !== undefined) track.nome = patch.nome;
  if (patch.descricao !== undefined) track.descricao = patch.descricao;
  if (patch.loop !== undefined) track.loop = !!patch.loop;
  if (patch.default_volume !== undefined) {
    if (patch.default_volume != null && (patch.default_volume < 0 || patch.default_volume > 1)) {
      throw erro("default_volume precisa estar entre 0 e 1.");
    }
    track.default_volume = patch.default_volume;
  }
  await track.save();

  await registrarAcao({
    idAdmin,
    acao: "MUSIC_TRACK_UPDATE",
    entidade: "MusicTrack",
    idEntidade: track.id,
    dadosAntes: antes,
    dadosDepois: track.toJSON(),
    req,
  });
  return track;
}

// Lista onde uma track está em uso: na config PUBLICADA (bloqueia
// desativação) e no histórico geral (bloqueia troca de key).
async function listarUsos(idTrack) {
  const publicada = await MusicConfigVersion.findOne({ where: { status: "PUBLISHED" } });
  const usos = { emConfigPublicada: [], totalHistorico: 0 };
  if (publicada) {
    const assignments = await MusicAssignment.findAll({
      where: { id_config_version: publicada.id, id_track: idTrack },
    });
    const memberships = await MusicPoolTrackAssignment.findAll({
      where: { id_config_version: publicada.id, id_track: idTrack },
    });
    usos.emConfigPublicada = [
      ...assignments.map((a) => ({ tipo: "assignment", slot_key: a.slot_key })),
      ...memberships.map((m) => ({ tipo: "pool_membership", id_pool: m.id_pool })),
    ];
  }
  usos.totalHistorico = await MusicAssignment.count({ where: { id_track: idTrack } });
  return usos;
}

async function desativarTrack(id, { idAdmin, req }) {
  const track = await obterTrackPorId(id);
  const usos = await listarUsos(id);
  if (usos.emConfigPublicada.length > 0) {
    const e = erro("Essa faixa está em uso na configuração publicada — troque os vínculos e publique antes de desativar.", 409);
    e.usos = usos.emConfigPublicada;
    throw e;
  }
  const antes = track.toJSON();
  track.ativo = false;
  await track.save();
  await registrarAcao({
    idAdmin,
    acao: "MUSIC_TRACK_DEACTIVATE",
    entidade: "MusicTrack",
    idEntidade: track.id,
    dadosAntes: antes,
    dadosDepois: track.toJSON(),
    req,
  });
  return track;
}

async function reativarTrack(id, { idAdmin, req }) {
  const track = await obterTrackPorId(id);
  const antes = track.toJSON();
  track.ativo = true;
  await track.save();
  await registrarAcao({
    idAdmin,
    acao: "MUSIC_TRACK_REACTIVATE",
    entidade: "MusicTrack",
    idEntidade: track.id,
    dadosAntes: antes,
    dadosDepois: track.toJSON(),
    req,
  });
  return track;
}

async function listarVersoes(idTrack) {
  await obterTrackPorId(idTrack);
  return MusicTrackFileVersion.findAll({ where: { id_track: idTrack }, order: [["versao", "DESC"]] });
}

async function uploadNovaVersao(idTrack, { buffer, nomeArquivoOriginal, mimeDeclarado }, { idAdmin, req }) {
  const track = await obterTrackPorId(idTrack);
  if (!buffer || buffer.length === 0) throw erro("Nenhum arquivo enviado.");
  if (buffer.length > TAMANHO_MAXIMO_BYTES) {
    throw erro(`O arquivo pode ter no máximo ${Math.round(TAMANHO_MAXIMO_BYTES / 1024 / 1024)}MB.`);
  }
  const mimeReal = mimeRealDeBytes(buffer);
  if (!mimeReal || !TIPOS_ACEITOS.includes((mimeDeclarado || mimeReal).toLowerCase())) {
    throw erro("Arquivo de áudio inválido — envie um MP3 (ou OGG) de verdade.");
  }

  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  const duplicata = await MusicTrackFileVersion.findOne({ where: { id_track: idTrack, checksum_sha256: checksum } });
  if (duplicata) {
    throw erro(`Esse arquivo já existe como a versão ${duplicata.versao} desta faixa.`, 409);
  }

  const duracaoMs = estimarDuracaoMs(buffer);
  const ultima = await MusicTrackFileVersion.findOne({ where: { id_track: idTrack }, order: [["versao", "DESC"]] });
  const novaVersao = (ultima?.versao ?? 0) + 1;

  const versao = await MusicTrackFileVersion.create({
    id_track: track.id,
    versao: novaVersao,
    nome_arquivo_original: nomeArquivoOriginal ?? null,
    mime: mimeReal,
    tamanho_bytes: buffer.length,
    duracao_ms: duracaoMs,
    dados: buffer,
    checksum_sha256: checksum,
    ativo: false,
    id_admin_criador: idAdmin,
  });

  await registrarAcao({
    idAdmin,
    acao: "MUSIC_TRACK_FILE_UPLOAD",
    entidade: "MusicTrackFileVersion",
    idEntidade: versao.id,
    dadosAntes: null,
    dadosDepois: { id_track: track.id, versao: novaVersao, tamanho_bytes: buffer.length, duracao_ms: duracaoMs },
    req,
  });

  return { id: versao.id, versao: novaVersao, duracao_ms: duracaoMs, tamanho_bytes: buffer.length, mime: mimeReal };
}

async function ativarVersao(idTrack, versaoNumero, { idAdmin, req }) {
  await obterTrackPorId(idTrack);
  return sequelize.transaction(async (transaction) => {
    const alvo = await MusicTrackFileVersion.findOne({
      where: { id_track: idTrack, versao: versaoNumero },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!alvo) throw erro("Versão de arquivo não encontrada.", 404);

    const atual = await MusicTrackFileVersion.findOne({
      where: { id_track: idTrack, ativo: true },
      transaction,
    });
    if (atual && atual.id !== alvo.id) {
      await atual.update({ ativo: false }, { transaction });
    }
    await alvo.update({ ativo: true }, { transaction });

    await registrarAcao({
      idAdmin,
      acao: "MUSIC_TRACK_FILE_ACTIVATE_VERSION",
      entidade: "MusicTrackFileVersion",
      idEntidade: alvo.id,
      dadosAntes: { versaoAtivaAntes: atual?.versao ?? null },
      dadosDepois: { versaoAtivaDepois: alvo.versao },
      req,
      transaction,
    });
    return alvo;
  });
}

// GET /api/music/tracks/:key/audio — resolve os bytes+headers pra
// servir, com ou sem Range (§6.4, OBRIGATÓRIO suportar 206).
async function obterArquivoParaServir(trackKey, versaoQuery) {
  const track = await MusicTrack.findOne({ where: { key: trackKey } });
  if (!track) return null;
  const where = { id_track: track.id };
  if (versaoQuery) where.versao = versaoQuery;
  else where.ativo = true;
  const versao = await MusicTrackFileVersion.scope("comDados").findOne({
    where,
    order: versaoQuery ? undefined : [["versao", "DESC"]],
  });
  if (!versao) return null;
  return {
    dados: versao.dados,
    mime: versao.mime,
    versao: versao.versao,
    tamanho_bytes: versao.tamanho_bytes,
    checksum: versao.checksum_sha256,
  };
}

module.exports = {
  listarTracks,
  obterTrackPorId,
  obterTrackPorKey,
  criarTrack,
  atualizarTrack,
  desativarTrack,
  reativarTrack,
  listarVersoes,
  uploadNovaVersao,
  ativarVersao,
  listarUsos,
  obterArquivoParaServir,
  validarKey,
};
