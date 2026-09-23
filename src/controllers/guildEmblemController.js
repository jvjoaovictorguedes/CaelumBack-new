// Upload e serving do emblema de guilda. Reusa exigirPermissao/
// registrarLog de guildController.js — mesma permissão "editar_identidade"
// já usada pra descrição/tipo de recrutamento (EditorIdentidade no
// frontend), nenhuma permissão nova precisa existir só pra isso.
const Guild = require("../models/Guild");
const { exigirPermissao, registrarLog } = require("./guildController");
const { validarEProcessarEmblema, ImagemInvalidaError } = require("../services/guildEmblemService");

exports.enviarEmblema = async (req, res) => {
  const idResponsavel = req.personagemAtual.id;
  if (!req.file?.buffer) {
    return res.status(400).json({ message: "Nenhuma imagem enviada." });
  }

  try {
    const membro = await exigirPermissao(req.params.id, idResponsavel, "editar_identidade");

    const { buffer, mime } = await validarEProcessarEmblema(req.file.buffer);

    const agora = new Date();
    // Guild.update em vez de findByPk+save: não precisa carregar a
    // imagem antiga (o defaultScope de Guild já exclui
    // emblema_imagem das queries normais, de propósito — ver Guild.js)
    // só pra sobrescrevê-la inteira.
    const [linhasAfetadas] = await Guild.update(
      {
        emblema_imagem: buffer,
        emblema_mime: mime,
        emblema_atualizado_em: agora,
        // Relativo à ORIGEM (protocolo+host, sem path) — mesma convenção
        // que resolveMediaUrl (caelumfront-new/src/utils/media-url.ts)
        // já usa pra resolver qualquer imagem_url que não seja um
        // asset estático do frontend (/images ou /icons): resolve
        // contra a origem da API, então precisa do "/api" aqui, já que
        // as rotas de guilda são montadas em /api/guilds (ver app.js).
        // Cache-busting via ?v=<timestamp>: a URL muda a cada upload,
        // então um <img src> já em cache não continua mostrando o
        // emblema antigo.
        emblema_url: `/api/guilds/${req.params.id}/emblem?v=${agora.getTime()}`,
      },
      { where: { id: req.params.id } },
    );
    if (linhasAfetadas === 0) {
      return res.status(404).json({ message: "Guilda não encontrada." });
    }

    await registrarLog(req.params.id, "emblema_atualizado", { responsavel: membro.id_personagem });

    const guildAtualizada = await Guild.findByPk(req.params.id, { attributes: ["id", "emblema_url"] });
    return res.status(200).json({ status: "success", data: { emblema_url: guildAtualizada.emblema_url } });
  } catch (error) {
    if (error instanceof ImagemInvalidaError) {
      return res.status(400).json({ message: error.message });
    }
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao enviar emblema da guilda:", error);
    return res.status(statusCode).json({ message: error.message || "Erro interno do servidor." });
  }
};

// Pública de propósito (sem authMiddleware) — o emblema é identidade
// visual da guilda, igual nome/sigla/descrição (guildPublica já expõe
// esses dados pra qualquer um, mesmo quem não é membro).
exports.obterEmblema = async (req, res) => {
  try {
    const guild = await Guild.scope("comImagem").findByPk(req.params.id, {
      attributes: ["id", "emblema_imagem", "emblema_mime"],
    });
    if (!guild || !guild.emblema_imagem) {
      return res.status(404).json({ message: "Essa guilda não tem emblema." });
    }
    res.set("Content-Type", guild.emblema_mime || "image/png");
    // Imutável na prática (a URL carrega ?v=<timestamp>, uma troca de
    // emblema gera uma URL nova) — pode cachear por muito tempo sem
    // risco de servir uma versão desatualizada.
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    return res.status(200).send(guild.emblema_imagem);
  } catch (error) {
    console.error("Erro ao servir emblema da guilda:", error);
    return res.status(500).json({ message: "Erro interno do servidor." });
  }
};
