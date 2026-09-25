// Painel Administrativo Fase 3 — controller fino da Biblioteca de Mídia.
const mediaAssetService = require("../services/mediaAssetService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.listar = async (req, res) => {
  try {
    const { categoria, tipo, nome, pagina, porPagina } = req.query;
    const resultado = await mediaAssetService.listMediaGroups({
      categoria,
      tipo,
      nome,
      pagina: pagina ? Number(pagina) : undefined,
      porPagina: porPagina ? Number(porPagina) : undefined,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar mídia.");
  }
};

exports.listarVersoes = async (req, res) => {
  try {
    const versoes = await mediaAssetService.listGroupVersions(req.params.grupo);
    res.status(200).json({ status: "success", data: { versoes } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar versões.");
  }
};

exports.upload = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Nenhum arquivo enviado." });
    }
    const asset = await mediaAssetService.uploadMediaAsset(
      {
        grupo: req.body.grupo,
        categoria: req.body.categoria,
        tipo: req.body.tipo,
        descricao: req.body.descricao || null,
        buffer: req.file.buffer,
        nomeArquivoOriginal: req.file.originalname,
        mimeDeclarado: req.file.mimetype,
      },
      { idAdmin: req.user.id, req },
    );
    res.status(201).json({ status: "success", data: { asset } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao enviar o arquivo.");
  }
};

exports.reverter = async (req, res) => {
  try {
    const asset = await mediaAssetService.revertToVersion(req.params.grupo, Number(req.params.versao), {
      idAdmin: req.user.id,
      req,
    });
    res.status(201).json({ status: "success", data: { asset } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao reverter a versão.");
  }
};

exports.desativar = async (req, res) => {
  try {
    const resultado = await mediaAssetService.deactivateGroup(req.params.grupo, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao desativar o grupo.");
  }
};

// Servida publicamente (sem authMiddleware) em /api/media/:grupo — a
// URL vira o valor gravado em imagem_url de Item/Power/etc, e telas de
// jogador comuns (sem token de admin) precisam conseguir carregar essas
// imagens num <img src>, igual já acontece com o emblema de guilda.
exports.servir = async (req, res) => {
  try {
    const versaoQuery = req.query.v ? Number(req.query.v) : undefined;
    const asset = await mediaAssetService.getBytesForServing(req.params.grupo, versaoQuery);
    if (!asset) {
      return res.status(404).json({ message: "Mídia não encontrada." });
    }
    res.set("Content-Type", asset.mime);
    // Só cacheia forte quando uma versão específica foi pedida (essa
    // nunca muda); sem ?v=, a URL pode passar a apontar pra outra
    // versão a qualquer upload novo.
    res.set("Cache-Control", versaoQuery ? "public, max-age=31536000, immutable" : "public, max-age=300");
    return res.status(200).send(asset.dados);
  } catch (error) {
    console.error("Erro ao servir mídia:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};
