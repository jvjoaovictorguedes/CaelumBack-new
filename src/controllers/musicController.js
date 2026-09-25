"use strict";

// Rotas PÚBLICAS de música (§11.1) — sem authMiddleware, qualquer tela
// de jogador precisa carregar isso. GET /api/music/tracks/:key/audio
// suporta HTTP Range (§6.4, obrigatório).
const musicConfigService = require("../services/musicConfigService");
const musicTrackService = require("../services/musicTrackService");

exports.obterConfig = async (req, res) => {
  try {
    const config = await musicConfigService.obterConfigPublicada();
    const etag = `"music-config-v${config.version}"`;
    if (req.headers["if-none-match"] === etag) {
      res.set("ETag", etag);
      return res.status(304).end();
    }
    res.set("ETag", etag);
    res.set("Cache-Control", "public, max-age=30");
    return res.status(200).json({ status: "success", data: config });
  } catch (error) {
    console.error("Erro ao obter configuração de música publicada:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

exports.servirAudio = async (req, res) => {
  try {
    const versaoQuery = req.query.v ? Number(req.query.v) : undefined;
    const arquivo = await musicTrackService.obterArquivoParaServir(req.params.key, versaoQuery);
    if (!arquivo) {
      return res.status(404).json({ message: "Faixa ou versão não encontrada." });
    }

    const { dados, mime, versao, tamanho_bytes: tamanho, checksum } = arquivo;
    const etag = `"${checksum}"`;
    res.set("Accept-Ranges", "bytes");
    res.set("Content-Type", mime);
    res.set("ETag", etag);
    res.set("Cache-Control", versaoQuery ? "public, max-age=31536000, immutable" : "public, max-age=300");

    const range = req.headers.range;
    if (!range) {
      res.set("Content-Length", String(tamanho));
      return res.status(200).send(dados);
    }

    // "bytes=start-end" — §6.4/§15.2: 206 com Content-Range/Content-Length
    // corretos, sem nunca ler fora dos limites do buffer.
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match) {
      res.set("Content-Range", `bytes */${tamanho}`);
      return res.status(416).end();
    }
    let inicio = match[1] === "" ? undefined : Number(match[1]);
    let fim = match[2] === "" ? undefined : Number(match[2]);
    if (inicio === undefined && fim === undefined) {
      res.set("Content-Range", `bytes */${tamanho}`);
      return res.status(416).end();
    }
    if (inicio === undefined) {
      // sufixo: últimos N bytes
      inicio = Math.max(0, tamanho - fim);
      fim = tamanho - 1;
    } else if (fim === undefined || fim >= tamanho) {
      fim = tamanho - 1;
    }
    if (inicio > fim || inicio < 0 || inicio >= tamanho) {
      res.set("Content-Range", `bytes */${tamanho}`);
      return res.status(416).end();
    }

    const pedaco = dados.subarray(inicio, fim + 1);
    res.status(206);
    res.set("Content-Range", `bytes ${inicio}-${fim}/${tamanho}`);
    res.set("Content-Length", String(pedaco.length));
    return res.send(pedaco);
  } catch (error) {
    console.error("Erro ao servir áudio de música:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};
