// Painel Administrativo Fase 3 — Biblioteca de Mídia. Duas montagens em
// app.js: adminMediaRouter (protegido, /api/admin/media) e
// mediaServingRouter (público, /api/media — nenhum authMiddleware, pois
// qualquer tela de jogador comum precisa carregar essas imagens).
const express = require("express");
const multer = require("multer");
const adminMediaController = require("../controllers/adminMediaController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");
const { TAMANHO_MAXIMO_BYTES } = require("../config/mediaAssetConfig");

// memoryStorage: precisa do buffer inteiro de uma vez pro sharp validar
// (mesmo padrão de guildRoutes.js/uploadEmblema) — sem disco intermediário.
const uploadMedia = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO_BYTES },
});

function tratarErroDeUpload(req, res, next) {
  uploadMedia.single("arquivo")(req, res, (erro) => {
    if (!erro) return next();
    if (erro instanceof multer.MulterError && erro.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message: `O arquivo pode ter no máximo ${Math.round(TAMANHO_MAXIMO_BYTES / 1024 / 1024)}MB.`,
      });
    }
    return res.status(400).json({ message: "Não foi possível processar o arquivo enviado." });
  });
}

const adminMediaRouter = express.Router();
adminMediaRouter.use(authMiddleware, adminMiddleware, requireAdminPermission("media.manage"));
adminMediaRouter.get("/", adminMediaController.listar);
adminMediaRouter.post("/", tratarErroDeUpload, adminMediaController.upload);
adminMediaRouter.get("/:grupo/versions", adminMediaController.listarVersoes);
adminMediaRouter.post("/:grupo/revert/:versao", adminMediaController.reverter);
adminMediaRouter.delete("/:grupo", adminMediaController.desativar);

const mediaServingRouter = express.Router();
mediaServingRouter.get("/:grupo", adminMediaController.servir);

module.exports = { adminMediaRouter, mediaServingRouter };
