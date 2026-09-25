// Painel Administrativo de Músicas — montada sob /api/admin/music.
// Baseline: music.manage. Ações de publicação/ativação de versão de
// áudio exigem também music.publish (§5/§6.3/§10).
const express = require("express");
const multer = require("multer");
const adminMusicController = require("../controllers/adminMusicController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const requireAdminPermission = require("../middlewares/requireAdminPermission");
const { TAMANHO_MAXIMO_BYTES } = require("../config/musicTrackConfig");

const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO_BYTES },
});

function tratarErroDeUpload(req, res, next) {
  uploadAudio.single("arquivo")(req, res, (erro) => {
    if (!erro) return next();
    if (erro instanceof multer.MulterError && erro.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message: `O arquivo pode ter no máximo ${Math.round(TAMANHO_MAXIMO_BYTES / 1024 / 1024)}MB.`,
      });
    }
    return res.status(400).json({ message: "Não foi possível processar o arquivo enviado." });
  });
}

const router = express.Router();
router.use(authMiddleware, adminMiddleware, requireAdminPermission("music.manage"));

router.get("/slots", adminMusicController.listarSlots);
router.get("/summary", adminMusicController.obterResumo);

router.get("/tracks", adminMusicController.listarTracks);
router.post("/tracks", adminMusicController.criarTrack);
router.put("/tracks/:id", adminMusicController.atualizarTrack);
router.post("/tracks/:id/deactivate", adminMusicController.desativarTrack);
router.post("/tracks/:id/reactivate", adminMusicController.reativarTrack);
router.get("/tracks/:id/files", adminMusicController.listarVersoes);
router.post("/tracks/:id/files", tratarErroDeUpload, adminMusicController.uploadVersao);
router.post(
  "/tracks/:id/files/:version/activate",
  requireAdminPermission("music.publish"),
  adminMusicController.ativarVersao,
);

router.get("/draft", adminMusicController.obterDraft);
router.put("/draft/assignments/:slotKey", adminMusicController.atualizarAssignment);
router.delete("/draft", adminMusicController.descartarDraft);
router.post("/draft/validate", adminMusicController.validarDraft);
router.post("/draft/publish", requireAdminPermission("music.publish"), adminMusicController.publicarDraft);

router.get("/pools", adminMusicController.listarPools);
router.post("/pools", adminMusicController.criarPool);
router.put("/draft/pools/:poolId/tracks", adminMusicController.atualizarTracksDoPool);

router.get("/history", adminMusicController.listarHistorico);
router.post("/history/:version/restore", requireAdminPermission("music.publish"), adminMusicController.restaurar);

module.exports = router;
