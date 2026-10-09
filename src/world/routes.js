const router = require("express").Router();
const { obterAcesso, exigirAcesso } = require("./acesso");
const { obterManifesto } = require("./manifesto");
router.use(require("../middlewares/authMiddleware"), require("../middlewares/currentCharacterMiddleware").carregarPersonagemAtual);
// Falha fechada no Front e no Back: cookie/ID enviado pelo cliente não concede acesso.
router.get("/acesso", async (req, res, next) => {
  try { const { habilitado } = await obterAcesso(req.personagemAtual.id); res.set("Cache-Control", "no-store").json({ data: { habilitado, fase: 0 } }); } catch (erro) { next(erro); }
});
router.get("/manifesto", exigirAcesso, async (req, res, next) => {
  try { res.set("Cache-Control", "no-store").json({ data: await obterManifesto(req.estadoMundo) }); } catch (erro) { next(erro); }
});
router.use(require("./respostaErro"));
module.exports = router;
