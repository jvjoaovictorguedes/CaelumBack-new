const router = require("express").Router();
const Estado = require("../models/CharacterWorldState");
const Character = require("../models/Character");
const { definirAcesso } = require("./acesso");
router.use(require("../middlewares/authMiddleware"), require("../middlewares/adminMiddleware"), require("../middlewares/requireAdminPermission")("world.manage"));
router.get("/:id/acesso", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: "Personagem inválido." });
    const personagem = await Character.findByPk(id, { attributes: ["id", "nome"] });
    if (!personagem) return res.status(404).json({ message: "Personagem não encontrado." });
    const estado = await Estado.findByPk(id);
    res.set("Cache-Control", "no-store").json({ data: { id_personagem: id, nome: personagem.nome, habilitado: estado?.mundo_habilitado === true } });
  } catch (erro) { next(erro); }
});
router.patch("/:id/acesso", async (req, res, next) => {
  try { res.json({ data: await definirAcesso(Number(req.params.id), req.body?.habilitado, req) }); } catch (erro) { next(erro); }
});
router.use(require("./respostaErro"));
module.exports = router;
