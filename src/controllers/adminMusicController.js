"use strict";

// Painel Administrativo de Músicas — controller fino, delega pros
// services (§11.2 lista as rotas administrativas 1:1 com as funções
// abaixo).
const musicTrackService = require("../services/musicTrackService");
const musicConfigService = require("../services/musicConfigService");
const adminMusicService = require("../services/adminMusicService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  const payload = { message: error.statusCode ? error.message : mensagemPadrao };
  if (error.erros) payload.erros = error.erros;
  if (error.usos) payload.usos = error.usos;
  res.status(statusCode).json(payload);
}

// --- Faixas ---

exports.listarTracks = async (req, res) => {
  try {
    const { nome, ativo } = req.query;
    const tracks = await musicTrackService.listarTracks({
      nome,
      ativo: ativo === undefined ? undefined : ativo === "true",
    });
    res.status(200).json({ status: "success", data: { tracks } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar faixas.");
  }
};

exports.criarTrack = async (req, res) => {
  try {
    const track = await musicTrackService.criarTrack(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { track } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar faixa.");
  }
};

exports.atualizarTrack = async (req, res) => {
  try {
    const track = await musicTrackService.atualizarTrack(req.params.id, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { track } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar faixa.");
  }
};

exports.desativarTrack = async (req, res) => {
  try {
    const track = await musicTrackService.desativarTrack(req.params.id, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { track } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao desativar faixa.");
  }
};

exports.reativarTrack = async (req, res) => {
  try {
    const track = await musicTrackService.reativarTrack(req.params.id, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { track } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao reativar faixa.");
  }
};

exports.listarVersoes = async (req, res) => {
  try {
    const versoes = await musicTrackService.listarVersoes(req.params.id);
    res.status(200).json({ status: "success", data: { versoes } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar versões.");
  }
};

exports.uploadVersao = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Nenhum arquivo enviado (campo 'arquivo')." });
    const versao = await musicTrackService.uploadNovaVersao(
      req.params.id,
      { buffer: req.file.buffer, nomeArquivoOriginal: req.file.originalname, mimeDeclarado: req.file.mimetype },
      { idAdmin: req.user.id, req },
    );
    res.status(201).json({ status: "success", data: { versao } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao enviar nova versão.");
  }
};

exports.ativarVersao = async (req, res) => {
  try {
    const versao = await musicTrackService.ativarVersao(req.params.id, Number(req.params.version), {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { versao } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao ativar versão.");
  }
};

// --- Slots / resumo ---

exports.listarSlots = async (req, res) => {
  try {
    res.status(200).json({ status: "success", data: { slots: adminMusicService.listarSlots() } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar slots.");
  }
};

exports.obterResumo = async (req, res) => {
  try {
    const resumo = await adminMusicService.obterResumo();
    res.status(200).json({ status: "success", data: resumo });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao obter resumo.");
  }
};

// --- Draft ---

exports.obterDraft = async (req, res) => {
  try {
    const draft = await musicConfigService.obterDraftCompleto();
    res.status(200).json({ status: "success", data: draft });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao obter rascunho.");
  }
};

exports.atualizarAssignment = async (req, res) => {
  try {
    const assignment = await musicConfigService.atualizarAssignment(req.params.slotKey, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { assignment } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar atribuição.");
  }
};

exports.descartarDraft = async (req, res) => {
  try {
    await musicConfigService.descartarDraft({ idAdmin: req.user.id, req });
    res.status(200).json({ status: "success" });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao descartar rascunho.");
  }
};

exports.validarDraft = async (req, res) => {
  try {
    const { draft } = await musicConfigService.obterDraftCompleto();
    const resultado = await musicConfigService.validarDraft(draft.id);
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao validar rascunho.");
  }
};

exports.publicarDraft = async (req, res) => {
  try {
    const publicado = await musicConfigService.publicarDraft({
      idAdmin: req.user.id,
      req,
      notes: req.body?.notes,
    });
    const io = req.app.get("io");
    if (io) io.emit("music:config-updated", { version: publicado.version_number });
    res.status(200).json({ status: "success", data: { version_number: publicado.version_number } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao publicar configuração.");
  }
};

// --- Pools ---

exports.listarPools = async (req, res) => {
  try {
    const pools = await musicConfigService.listarPools();
    res.status(200).json({ status: "success", data: { pools } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar pools.");
  }
};

exports.criarPool = async (req, res) => {
  try {
    const pool = await musicConfigService.criarPool(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { pool } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar pool.");
  }
};

exports.atualizarTracksDoPool = async (req, res) => {
  try {
    const membros = await musicConfigService.atualizarTracksDoPool(req.params.poolId, req.body?.itens ?? [], {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { membros } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar faixas do pool.");
  }
};

// --- Histórico / rollback ---

exports.listarHistorico = async (req, res) => {
  try {
    const historico = await musicConfigService.listarHistorico();
    res.status(200).json({ status: "success", data: { historico } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar histórico.");
  }
};

exports.restaurar = async (req, res) => {
  try {
    const draft = await musicConfigService.restaurarComoNovoDraft(Number(req.params.version), {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { draft } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao restaurar versão.");
  }
};
